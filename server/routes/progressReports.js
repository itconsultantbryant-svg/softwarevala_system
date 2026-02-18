const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole, hashPassword } = require('../utils/auth');
const { logAction } = require('../utils/audit');
const crypto = require('crypto');

// Generate unique client ID
function generateClientId() {
  return 'CLT-' + Date.now().toString().slice(-8) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
}

// Get all progress reports (accessible to Admin, Department Heads, and Staff)
router.get('/', authenticateToken, requireRole('Admin', 'DepartmentHead', 'Staff'), async (req, res) => {
  try {
    const { from_date, to_date, category, status, department_id, created_by } = req.query;
    
    let query = `
      SELECT pr.*, d.name as department_full_name
      FROM progress_reports pr
      LEFT JOIN departments d ON pr.department_id = d.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by date range
    if (from_date) {
      query += ' AND DATE(pr.date) >= ?';
      params.push(from_date);
    }
    if (to_date) {
      query += ' AND DATE(pr.date) <= ?';
      params.push(to_date);
    }
    
    // Filter by category
    if (category) {
      query += ' AND pr.category = ?';
      params.push(category);
    }
    
    // Filter by status
    if (status) {
      query += ' AND pr.status = ?';
      params.push(status);
    }
    
    // Filter by department
    if (department_id) {
      query += ' AND pr.department_id = ?';
      params.push(department_id);
    }
    
    // Filter by creator
    if (created_by) {
      query += ' AND pr.created_by = ?';
      params.push(created_by);
    }

    query += ' ORDER BY pr.date DESC, pr.created_at DESC';

    const reports = await db.all(query, params);
    res.json({ reports });
  } catch (error) {
    console.error('Get progress reports error:', error);
    // If table doesn't exist, return empty array instead of 500 error
    if (error.message && error.message.includes('no such table')) {
      console.warn('progress_reports table does not exist yet');
      return res.json({ reports: [] });
    }
    res.status(500).json({ error: 'Failed to fetch progress reports' });
  }
});

// Get single progress report
router.get('/:id', authenticateToken, requireRole('Admin', 'DepartmentHead', 'Staff'), async (req, res) => {
  try {
    const report = await db.get(
      `SELECT pr.*, d.name as department_full_name
       FROM progress_reports pr
       LEFT JOIN departments d ON pr.department_id = d.id
       WHERE pr.id = ?`,
      [req.params.id]
    );

    if (!report) {
      return res.status(404).json({ error: 'Progress report not found' });
    }

    res.json({ report });
  } catch (error) {
    console.error('Get progress report error:', error);
    res.status(500).json({ error: 'Failed to fetch progress report' });
  }
});

// Create progress report
router.post('/', authenticateToken, requireRole('Admin', 'DepartmentHead', 'Staff'), [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('date').isISO8601().withMessage('Valid date is required'),
  body('category').isIn(['Student', 'Client for Consultancy', 'Client for Audit', 'Others']).withMessage('Valid category is required'),
  body('status').optional().isIn(['Signed Contract', 'Pipeline Client', 'Submitted']).withMessage('Valid status is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { name, date, category, status, amount } = req.body;

    // All progress reports require admin approval
    // Set initial status to 'Pending' (pending admin approval)
    const reportStatus = 'Pending';

    // Get user's department information
    // For DepartmentHead: Join on head_email
    // For Staff: Get department from staff table
    let user, departmentId, departmentName;
    
    if (req.user.role === 'Staff') {
      // Get department from staff record
      const staff = await db.get(
        `SELECT s.department, d.id as department_id, d.name as department_name
         FROM staff s
         LEFT JOIN departments d ON d.name = s.department
         WHERE s.user_id = ?`,
        [req.user.id]
      );
      if (staff) {
        departmentId = staff.department_id;
        departmentName = staff.department_name || staff.department;
      }
      user = req.user;
    } else {
      // For Admin and DepartmentHead: Join on head_email
      const userWithDept = await db.get(
        `SELECT u.*, d.id as department_id, d.name as department_name
         FROM users u
         LEFT JOIN departments d ON LOWER(TRIM(d.head_email)) = LOWER(TRIM(u.email))
         WHERE u.id = ?`,
        [req.user.id]
      );
      if (userWithDept) {
        user = userWithDept;
        departmentId = userWithDept.department_id;
        departmentName = userWithDept.department_name;
      } else {
        user = req.user;
      }
    }

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Create progress report
    // Ensure created_by_name and created_by_email are not null
    const createdByName = req.user.name || user.name || 'Unknown';
    const createdByEmail = req.user.email || user.email || '';
    
    // Ensure the constraint allows 'Pending' status before inserting
    // Try to update constraint if it fails
    let result;
    try {
      result = await db.run(
        `INSERT INTO progress_reports 
         (name, date, category, status, amount, department_id, department_name, created_by, created_by_name, created_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          date,
          category,
          reportStatus, // Always 'Pending' for admin approval
          amount || 0,
          user.department_id || null,
          user.department_name || null,
          req.user.id,
          createdByName,
          createdByEmail
        ]
      );
    } catch (insertError) {
      // If constraint violation, try to fix the constraint and retry
      if (insertError.message && insertError.message.includes('check constraint') && insertError.message.includes('progress_reports_status_check')) {
        console.log('Constraint violation detected, attempting to update constraint...');
        const USE_POSTGRESQL = !!process.env.DATABASE_URL;
        
        if (USE_POSTGRESQL) {
          try {
            // Find and drop the existing constraint
            const constraint = await db.get(`
              SELECT constraint_name 
              FROM information_schema.table_constraints 
              WHERE table_name = 'progress_reports' 
              AND constraint_type = 'CHECK'
              AND constraint_name LIKE '%status%'
            `);
            
            if (constraint) {
              await db.run(`ALTER TABLE progress_reports DROP CONSTRAINT ${constraint.constraint_name}`);
            } else {
              // Try common constraint names
              const constraintNames = ['progress_reports_status_check', 'progress_reports_status_chk', 'check_status'];
              for (const constraintName of constraintNames) {
                try {
                  await db.run(`ALTER TABLE progress_reports DROP CONSTRAINT IF EXISTS ${constraintName}`);
                } catch (e) {
                  // Ignore if doesn't exist
                }
              }
            }
            
            // Add new constraint with all status values
            await db.run(`
              ALTER TABLE progress_reports 
              ADD CONSTRAINT progress_reports_status_check 
              CHECK (status IN ('Pending', 'Signed Contract', 'Pipeline Client', 'Submitted', 'Approved', 'Rejected'))
            `);
            console.log('✓ Updated progress_reports status constraint');
            
            // Retry the insert
            result = await db.run(
              `INSERT INTO progress_reports 
               (name, date, category, status, amount, department_id, department_name, created_by, created_by_name, created_by_email)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                name,
                date,
                category,
                reportStatus,
                amount || 0,
                user.department_id || null,
                user.department_name || null,
                req.user.id,
                createdByName,
                createdByEmail
              ]
            );
          } catch (constraintError) {
            console.error('Error updating constraint:', constraintError);
            throw insertError; // Re-throw original error
          }
        } else {
          // SQLite doesn't support ALTER TABLE for CHECK constraints
          // The constraint should be correct in the CREATE TABLE statement
          throw insertError;
        }
      } else {
        throw insertError;
      }
    }

    // Also create a client entry from the progress report (only for client categories, not students)
    let clientId = null;
    let clientCreated = false;
    let createdClientId = null;
    
    // Only create client if category is not 'Student'
    if (category !== 'Student' && (category === 'Client for Consultancy' || category === 'Client for Audit' || category === 'Others')) {
      try {
        // Check if clients table exists
        const USE_POSTGRESQL = !!process.env.DATABASE_URL;
        let clientsTableExists = false;
        
        if (USE_POSTGRESQL) {
          const tableCheck = await db.get(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'clients'"
          );
          clientsTableExists = !!tableCheck;
        } else {
          const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='clients'");
          clientsTableExists = !!tableCheck;
        }
        
        if (!clientsTableExists) {
          console.log('Clients table does not exist, skipping client creation');
        } else {
          // Generate unique email for client based on name and timestamp
          const sanitizedName = name.toLowerCase().replace(/[^a-z0-9]/g, '.');
          const timestamp = Date.now().toString().slice(-6);
          const clientEmail = `${sanitizedName}.${timestamp}@progress.local`;
          
          // Check if a client with this name already exists (by company_name or user name)
          const existingClientByName = await db.get(
            'SELECT id, user_id FROM clients WHERE company_name = ? OR (SELECT name FROM users WHERE id = clients.user_id) = ?',
            [name, name]
          );
          
          if (!existingClientByName) {
            // Check if user exists
            let userId = null;
            const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [clientEmail]);
            
            if (!existingUser) {
              // Create user for client
              const { hashPassword } = require('../utils/auth');
              const passwordHash = await hashPassword('Client@123'); // Default password
              
              const userResult = await db.run(
                `INSERT INTO users (email, username, password_hash, role, name, is_active, email_verified)
                 VALUES (?, ?, ?, ?, ?, 1, 1)`,
                [clientEmail, clientEmail.split('@')[0], passwordHash, 'Client', name]
              );
              userId = USE_POSTGRESQL ? (userResult.rows && userResult.rows[0] && userResult.rows[0].id) : userResult.lastID;
            } else {
              userId = existingUser.id;
            }

            // Check if client already exists for this user
            const existingClient = await db.get('SELECT id FROM clients WHERE user_id = ?', [userId]);
            if (!existingClient) {
              const generatedClientId = generateClientId();
              
              // Map progress report category to client table category
              const categoryMap = {
                'Client for Consultancy': 'client for consultancy',
                'Client for Audit': 'client for audit',
                'Others': 'others'
              };
              const clientCategory = categoryMap[category] || category.toLowerCase();
              
              // Map progress report status to client table progress_status
              const statusMap = {
                'Signed Contract': 'signed contract',
                'Pipeline Client': 'pipeline client',
                'Submitted': 'submitted',
                'Pending': 'pending'
              };
              const clientProgressStatus = statusMap[status] || (status ? status.toLowerCase() : 'pending');
              
              // Check which columns exist in clients table
              let clientsColumnNames = [];
              if (USE_POSTGRESQL) {
                const columns = await db.all(
                  "SELECT column_name FROM information_schema.columns WHERE table_name = 'clients'"
                );
                clientsColumnNames = columns.map(col => col.column_name);
              } else {
                const tableInfo = await db.all("PRAGMA table_info(clients)");
                clientsColumnNames = tableInfo.map(col => col.name);
              }
              
              const hasCategory = clientsColumnNames.includes('category');
              const hasProgressStatus = clientsColumnNames.includes('progress_status');
              const hasCreatedBy = clientsColumnNames.includes('created_by');
              
              // Build INSERT query dynamically
              let insertColumns = ['user_id', 'client_id', 'company_name', 'status'];
              let insertValues = [userId, generatedClientId, name, 'Active'];
              
              if (hasCategory) {
                insertColumns.push('category');
                insertValues.push(clientCategory);
              }
              if (hasProgressStatus) {
                insertColumns.push('progress_status');
                insertValues.push(clientProgressStatus);
              }
              if (hasCreatedBy) {
                insertColumns.push('created_by');
                insertValues.push(req.user.id);
              }
              
              const placeholders = insertColumns.map(() => '?').join(', ');
              const clientResult = await db.run(
                `INSERT INTO clients (${insertColumns.join(', ')})
                 VALUES (${placeholders})`,
                insertValues
              );
              
              createdClientId = USE_POSTGRESQL 
                ? (clientResult.rows && clientResult.rows[0] && clientResult.rows[0].id)
                : clientResult.lastID;
              
              clientId = generatedClientId;
              clientCreated = true;
              
              console.log('Client created from progress report:', {
                client_id: generatedClientId,
                client_db_id: createdClientId,
                name: name,
                category: clientCategory
              });
              
              // Emit real-time update for new client to all connected clients
              if (global.io) {
                global.io.emit('client_created', {
                  id: createdClientId,
                  client_id: generatedClientId,
                  name: name,
                  company_name: name,
                  category: clientCategory,
                  progress_status: clientProgressStatus,
                  status: 'Active',
                  created_by: req.user.name || user.name,
                  created_by_email: req.user.email || user.email
                });
                console.log('Emitted client_created event for client:', generatedClientId);
              }
            } else {
              console.log('Client already exists for this user, skipping client creation');
            }
          } else {
            console.log('Client with this name already exists, skipping client creation');
            // Update existing client's progress_status if status changed
            if (status) {
              try {
                const statusMap = {
                  'Signed Contract': 'signed contract',
                  'Pipeline Client': 'pipeline client',
                  'Submitted': 'submitted',
                  'Pending': 'pending'
                };
                const clientProgressStatus = statusMap[status] || status.toLowerCase();
                
                // Check if progress_status column exists
                let clientsColumnNames = [];
                if (USE_POSTGRESQL) {
                  const columns = await db.all(
                    "SELECT column_name FROM information_schema.columns WHERE table_name = 'clients'"
                  );
                  clientsColumnNames = columns.map(col => col.column_name);
                } else {
                  const tableInfo = await db.all("PRAGMA table_info(clients)");
                  clientsColumnNames = tableInfo.map(col => col.name);
                }
                
                if (clientsColumnNames.includes('progress_status')) {
                  await db.run(
                    'UPDATE clients SET progress_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                    [clientProgressStatus, existingClientByName.id]
                  );
                  
                  // Emit update event
                  if (global.io) {
                    global.io.emit('client_updated', {
                      id: existingClientByName.id,
                      progress_status: clientProgressStatus,
                      updated_by: req.user.name
                    });
                  }
                }
              } catch (updateError) {
                console.error('Error updating existing client progress_status:', updateError);
              }
            }
          }
        }
      } catch (clientError) {
        // Log error but don't fail the progress report creation
        console.error('Error creating client from progress report:', clientError);
      }
    }

    await logAction(req.user.id, 'create_progress_report', 'progress_reports', result.lastID, { name, category, status }, req);

    // Create a pending target_progress entry when progress report is created (if it has an amount)
    // This allows admin to see and approve it in the targets management area
    if (amount && parseFloat(amount) > 0) {
      try {
        // Find active target for the creator
        const target = await db.get(
          'SELECT * FROM targets WHERE user_id = ? AND status = ?',
          [req.user.id, 'Active']
        );

        if (target) {
          // Check if progress already exists for this report
          const existingProgress = await db.get(
            'SELECT id FROM target_progress WHERE progress_report_id = ?',
            [result.lastID]
          );

          if (!existingProgress) {
            // Create pending target_progress entry
            const targetIdInt = parseInt(target.id);
            const userIdInt = parseInt(req.user.id);
            const amountFloat = parseFloat(amount);
            
            await db.run(
              `INSERT INTO target_progress (target_id, user_id, progress_report_id, amount, category, status, transaction_date)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                targetIdInt,
                userIdInt,
                result.lastID,
                amountFloat,
                category || null,
                'Pending', // Set to 'Pending' for admin approval
                date || null
              ]
            );
            
            console.log('Created pending target_progress entry for new progress report:', {
              progress_report_id: result.lastID,
              target_id: targetIdInt,
              amount: amountFloat
            });

            // Emit socket event to notify about new pending progress
            if (global.io) {
              global.io.emit('target_progress_created', {
                progress_report_id: result.lastID,
                target_id: targetIdInt,
                user_id: userIdInt,
                amount: amountFloat,
                status: 'Pending',
                action: 'progress_report_created'
              });
            }
          }
        } else {
          console.log('No active target found for user:', req.user.id, '- skipping target_progress creation');
        }
      } catch (targetProgressError) {
        // Log error but don't fail the progress report creation
        console.error('Error creating target_progress entry for new progress report:', targetProgressError);
      }
    }

    // Emit real-time update for progress report
    if (global.io) {
      global.io.emit('progress_report_created', {
        id: result.lastID,
        name: name,
        category: category,
        status: status,
        amount: amount || 0,
        department: user.department_name || null,
        created_by: req.user.name || user.name
      });
    }

    res.status(201).json({
      message: 'Progress report created successfully',
      report: { id: result.lastID },
      client_created: clientCreated,
      client_id: clientId
    });
  } catch (error) {
    console.error('Create progress report error:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      errno: error.errno,
      sql: error.sql
    });
    
    // Handle specific database errors
    let errorMessage = 'Failed to create progress report';
    if (error.message && error.message.includes('FOREIGN KEY constraint')) {
      errorMessage = 'Foreign key constraint failed. Please ensure department and user exist.';
    } else if (error.message && error.message.includes('NOT NULL constraint')) {
      errorMessage = 'Required fields are missing.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Update progress report (only by creator or admin)
router.put('/:id', authenticateToken, requireRole('Admin', 'DepartmentHead', 'Staff'), [
  body('name').optional().trim().notEmpty(),
  body('date').optional().isISO8601(),
  body('category').optional().isIn(['Student', 'Client for Consultancy', 'Client for Audit', 'Others']),
  body('status').optional().isIn(['Signed Contract', 'Pipeline Client', 'Submitted'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    // Check if report exists and user has permission
    const report = await db.get('SELECT * FROM progress_reports WHERE id = ?', [req.params.id]);
    if (!report) {
      return res.status(404).json({ error: 'Progress report not found' });
    }

    // Admin can edit all progress reports, others can only edit their own
    if (req.user.role !== 'Admin' && report.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    
    // Non-admin users can only edit if report is still pending approval
    // Admin can edit any progress report regardless of status
    if (req.user.role !== 'Admin' && report.status !== 'Pending') {
      return res.status(403).json({ error: 'Cannot edit progress report that has been approved or rejected' });
    }

    const updates = [];
    const params = [];

    if (req.body.name) {
      updates.push('name = ?');
      params.push(req.body.name);
    }
    if (req.body.date) {
      updates.push('date = ?');
      params.push(req.body.date);
    }
    if (req.body.category) {
      updates.push('category = ?');
      params.push(req.body.category);
    }
    if (req.body.status) {
      updates.push('status = ?');
      params.push(req.body.status);
    }
    if (req.body.amount !== undefined) {
      updates.push('amount = ?');
      params.push(req.body.amount);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    await db.run(
      `UPDATE progress_reports SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    // Auto-update target progress if amount is updated
    if (req.body.amount !== undefined) {
      try {
        const updatedReport = await db.get('SELECT * FROM progress_reports WHERE id = ?', [req.params.id]);
        if (updatedReport) {
          const target = await db.get(
            'SELECT * FROM targets WHERE user_id = ? AND status = ?',
            [updatedReport.created_by, 'Active']
          );

          if (target) {
            const existingProgress = await db.get(
              'SELECT id FROM target_progress WHERE progress_report_id = ?',
              [req.params.id]
            );

            if (existingProgress) {
              // Keep existing status when updating - don't change approval status just because report is edited
              const existingProgressData = await db.get(
                'SELECT status FROM target_progress WHERE progress_report_id = ?',
                [req.params.id]
              );
              
              await db.run(
                `UPDATE target_progress 
                 SET amount = ?, category = ?, transaction_date = ?, updated_at = CURRENT_TIMESTAMP
                 WHERE progress_report_id = ?`,
                [
                  updatedReport.amount || 0,
                  updatedReport.category,
                  updatedReport.date,
                  req.params.id
                ]
              );
            } else {
              // Create new progress entry with Pending status (needs admin approval)
              await db.run(
                `INSERT INTO target_progress (target_id, user_id, progress_report_id, amount, category, status, transaction_date)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                  target.id,
                  updatedReport.created_by,
                  req.params.id,
                  updatedReport.amount || 0,
                  updatedReport.category,
                  'Pending', // New entries start as Pending
                  updatedReport.date
                ]
              );
            }
            
            // Verify the total progress for this target (only Approved entries, same as GET /targets)
            // Check for status = 'Approved' first, then normalized
            const totalProgressCheck = await db.get(
              `SELECT COALESCE(SUM(CASE 
                 WHEN status = 'Approved' OR UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' OR status IS NULL OR status = ''
                 THEN COALESCE(CAST(amount AS NUMERIC), CAST(progress_amount AS NUMERIC), 0)
                 ELSE 0
               END), 0) as total 
               FROM target_progress 
               WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)`,
              [target.id]
            );
            console.log('Total progress for target', target.id, 'after update (Approved entries only):', totalProgressCheck);
            
            // Update admin target in database when staff/dept head target progress changes (background)
            setImmediate(async () => {
              try {
                const targetsModule = require('./targets');
                const targetInfo = await db.get('SELECT period_start FROM targets WHERE id = ?', [target.id]);
                if (targetInfo && targetsModule && typeof targetsModule.updateAdminTarget === 'function') {
                  await targetsModule.updateAdminTarget(targetInfo.period_start);
                  console.log('Admin target updated after progress report edit');
                }
              } catch (adminUpdateError) {
                console.error('Error updating admin target after progress report edit (non-fatal):', adminUpdateError);
              }
            });
            
            // Calculate full target metrics for the update
            let fullMetrics = {
              total_progress: parseFloat(totalProgressCheck?.total || 0),
              shared_in: 0,
              shared_out: 0,
              net_amount: parseFloat(totalProgressCheck?.total || 0),
              progress_percentage: '0.00',
              remaining_amount: parseFloat(target.target_amount || 0)
            };
            
            try {
              const USE_POSTGRESQL = !!process.env.DATABASE_URL;
              let fundSharingExists = false;
              
              if (USE_POSTGRESQL) {
                const fsCheck = await db.get(
                  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fund_sharing'"
                );
                fundSharingExists = !!fsCheck;
              } else {
                const fsCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fund_sharing'");
                fundSharingExists = !!fsCheck;
              }
              
              if (fundSharingExists) {
                const sharedOutResult = await db.get(
                  `SELECT COALESCE(SUM(CASE WHEN status = 'Active' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as total
                   FROM fund_sharing WHERE from_user_id = ?`,
                  [target.user_id]
                );
                const sharedInResult = await db.get(
                  `SELECT COALESCE(SUM(CASE WHEN status = 'Active' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as total
                   FROM fund_sharing WHERE to_user_id = ?`,
                  [target.user_id]
                );
                
                fullMetrics.shared_out = parseFloat(sharedOutResult?.total || 0) || 0;
                fullMetrics.shared_in = parseFloat(sharedInResult?.total || 0) || 0;
              }
              
              const targetAmount = parseFloat(target.target_amount || 0) || 0;
              fullMetrics.net_amount = fullMetrics.total_progress + fullMetrics.shared_in - fullMetrics.shared_out;
              fullMetrics.progress_percentage = targetAmount > 0 
                ? ((fullMetrics.net_amount / targetAmount) * 100).toFixed(2) 
                : '0.00';
              fullMetrics.remaining_amount = Math.max(0, targetAmount - fullMetrics.net_amount);
            } catch (metricsError) {
              console.error('Error calculating full target metrics in progressReports update:', metricsError);
            }
            
            // Emit real-time update for target progress - emit to all users with full metrics
            if (global.io) {
              global.io.emit('target_progress_updated', {
                target_id: target.id,
                user_id: updatedReport.created_by,
                progress_report_id: req.params.id,
                action: 'progress_updated',
                ...fullMetrics
              });
              
              // Also emit target_updated with full metrics
              global.io.emit('target_updated', {
                id: target.id,
                updated_by: req.user.name || 'Admin',
                reason: 'progress_report_updated',
                ...fullMetrics
              });
              console.log('Emitted target_progress_updated and target_updated events with full metrics');
            }
          }
        }
      } catch (targetError) {
        console.error('Error updating target progress:', targetError);
      }
    }

    await logAction(req.user.id, 'update_progress_report', 'progress_reports', req.params.id, req.body, req);

    // Emit real-time update
    if (global.io) {
      global.io.emit('progress_report_updated', {
        id: req.params.id,
        updated_by: req.user.name
      });
    }

    res.json({ message: 'Progress report updated successfully' });
  } catch (error) {
    console.error('Update progress report error:', error);
    res.status(500).json({ error: 'Failed to update progress report' });
  }
});

// Admin approval/rejection for progress reports
router.put('/:id/approve', authenticateToken, requireRole('Admin'), [
  body('status').isIn(['Approved', 'Rejected']).withMessage('Status must be Approved or Rejected'),
  body('admin_notes').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status, admin_notes } = req.body;
    const report = await db.get('SELECT * FROM progress_reports WHERE id = ?', [req.params.id]);
    
    if (!report) {
      return res.status(404).json({ error: 'Progress report not found' });
    }

    if (report.status !== 'Pending') {
      return res.status(400).json({ error: 'Progress report is not pending approval' });
    }

    // Check if admin columns exist, and add them if they don't
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    let hasAdminNotes = false;
    let hasAdminReviewedBy = false;
    
    try {
      if (USE_POSTGRESQL) {
        const adminNotesCheck = await db.get(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'progress_reports' AND column_name = 'admin_notes'"
        );
        hasAdminNotes = !!adminNotesCheck;
        
        const adminReviewedByCheck = await db.get(
          "SELECT column_name FROM information_schema.columns WHERE table_name = 'progress_reports' AND column_name = 'admin_reviewed_by'"
        );
        hasAdminReviewedBy = !!adminReviewedByCheck;
      } else {
        const tableInfo = await db.all("PRAGMA table_info(progress_reports)");
        hasAdminNotes = tableInfo.some(col => col.name === 'admin_notes');
        hasAdminReviewedBy = tableInfo.some(col => col.name === 'admin_reviewed_by');
      }
      
      if (!hasAdminNotes) {
        await db.run('ALTER TABLE progress_reports ADD COLUMN admin_notes TEXT');
        console.log('Added admin_notes column to progress_reports');
      }
      if (!hasAdminReviewedBy) {
        await db.run('ALTER TABLE progress_reports ADD COLUMN admin_reviewed_by INTEGER');
        await db.run('ALTER TABLE progress_reports ADD COLUMN admin_reviewed_at DATETIME');
        console.log('Added admin_reviewed_by and admin_reviewed_at columns to progress_reports');
      }
    } catch (columnError) {
      console.error('Error checking/adding admin columns (non-fatal):', columnError);
      // Continue - columns might already exist or we'll handle it in the UPDATE
    }

    // Update the progress report status
    try {
      // Build UPDATE query dynamically based on which columns exist
      const updateFields = ['status = ?', 'updated_at = CURRENT_TIMESTAMP'];
      const updateParams = [status];
      
      if (hasAdminNotes) {
        updateFields.push('admin_notes = ?');
        updateParams.push(admin_notes || null);
      }
      
      if (hasAdminReviewedBy) {
        updateFields.push('admin_reviewed_by = ?', 'admin_reviewed_at = CURRENT_TIMESTAMP');
        updateParams.push(req.user.id);
      }
      
      updateParams.push(req.params.id);
      
      await db.run(
        `UPDATE progress_reports 
         SET ${updateFields.join(', ')}
         WHERE id = ?`,
        updateParams
      );
      console.log('Progress report status updated successfully:', { id: req.params.id, status });
    } catch (updateError) {
      console.error('Error updating progress report status:', updateError);
      console.error('Update error details:', {
        message: updateError.message,
        code: updateError.code,
        errno: updateError.errno,
        sql: updateError.sql
      });
      throw new Error(`Failed to update progress report: ${updateError.message}`);
    }

    // Log the action (don't fail if logging fails)
    try {
      await logAction(req.user.id, 'approve_progress_report', 'progress_reports', req.params.id, { status }, req);
    } catch (logError) {
      console.error('Error logging action (non-fatal):', logError);
      // Continue even if logging fails
    }

    // Create client if client_name is provided but client_id is not
    if (status === 'Approved' && report.client_name && !report.client_id) {
      try {
        const { generateClientId } = require('./clients');
        const USE_POSTGRESQL = !!process.env.DATABASE_URL;
        
        // Check if client already exists by name
        const existingClientByName = await db.get(
          'SELECT * FROM clients WHERE company_name = ? OR name = ? LIMIT 1',
          [report.client_name, report.client_name]
        );
        
        if (!existingClientByName) {
          // Find or create user for client
          let userId = null;
          const clientEmail = report.client_email || `${report.client_name.toLowerCase().replace(/\s+/g, '.')}@client.local`;
          
          const existingUser = await db.get('SELECT * FROM users WHERE email = ?', [clientEmail]);
          
          if (!existingUser) {
            const crypto = require('crypto');
            const passwordHash = crypto.randomBytes(16).toString('hex');
            
            const userResult = await db.run(
              `INSERT INTO users (email, username, password_hash, role, name, is_active, email_verified)
               VALUES (?, ?, ?, ?, ?, 1, 1)`,
              [clientEmail, clientEmail.split('@')[0], passwordHash, 'Client', report.client_name]
            );
            userId = USE_POSTGRESQL ? (userResult.rows && userResult.rows[0] && userResult.rows[0].id) : userResult.lastID;
          } else {
            userId = existingUser.id;
          }
          
          // Check if client already exists for this user
          const existingClient = await db.get('SELECT id FROM clients WHERE user_id = ?', [userId]);
          if (!existingClient) {
            const generatedClientId = generateClientId();
            
            // Map progress report category to client table category
            const categoryMap = {
              'Client for Consultancy': 'client for consultancy',
              'Client for Audit': 'client for audit',
              'Others': 'others'
            };
            const clientCategory = categoryMap[report.category] || (report.category ? report.category.toLowerCase() : 'others');
            
            // Map progress report status to client table progress_status
            const statusMap = {
              'Signed Contract': 'signed contract',
              'Pipeline Client': 'pipeline client',
              'Submitted': 'submitted',
              'Pending': 'pending'
            };
            const clientProgressStatus = statusMap[report.status] || (report.status ? report.status.toLowerCase() : 'pending');
            
            // Check which columns exist in clients table
            let clientsColumnNames = [];
            if (USE_POSTGRESQL) {
              const columns = await db.all(
                "SELECT column_name FROM information_schema.columns WHERE table_name = 'clients'"
              );
              clientsColumnNames = columns.map(col => col.column_name);
            } else {
              const tableInfo = await db.all("PRAGMA table_info(clients)");
              clientsColumnNames = tableInfo.map(col => col.name);
            }
            
            const hasCategory = clientsColumnNames.includes('category');
            const hasProgressStatus = clientsColumnNames.includes('progress_status');
            const hasCreatedBy = clientsColumnNames.includes('created_by');
            
            // Build INSERT query dynamically
            let insertColumns = ['user_id', 'client_id', 'company_name', 'status'];
            let insertValues = [userId, generatedClientId, report.client_name, 'Active'];
            
            if (hasCategory) {
              insertColumns.push('category');
              insertValues.push(clientCategory);
            }
            if (hasProgressStatus) {
              insertColumns.push('progress_status');
              insertValues.push(clientProgressStatus);
            }
            if (hasCreatedBy) {
              insertColumns.push('created_by');
              insertValues.push(req.user.id);
            }
            
            const placeholders = insertColumns.map(() => '?').join(', ');
            const clientResult = await db.run(
              `INSERT INTO clients (${insertColumns.join(', ')})
               VALUES (${placeholders})`,
              insertValues
            );
            
            const createdClientId = USE_POSTGRESQL 
              ? (clientResult.rows && clientResult.rows[0] && clientResult.rows[0].id)
              : clientResult.lastID;
            
            console.log('Client created from progress report approval:', {
              client_id: generatedClientId,
              client_db_id: createdClientId,
              name: report.client_name,
              category: clientCategory
            });
            
            // Emit real-time update for new client
            if (global.io) {
              global.io.emit('client_created', {
                id: createdClientId,
                client_id: generatedClientId,
                name: report.client_name,
                company_name: report.client_name,
                category: clientCategory,
                progress_status: clientProgressStatus,
                status: 'Active',
                created_by: req.user.name || 'Admin',
                created_by_email: req.user.email
              });
              console.log('Emitted client_created event for client:', generatedClientId);
            }
          }
        }
      } catch (clientError) {
        console.error('Error creating client from progress report approval (non-fatal):', clientError);
        // Continue - don't fail the approval if client creation fails
      }
    }

    // Only update target progress if the report is APPROVED and has an amount
    if (status === 'Approved' && report.amount && parseFloat(report.amount) > 0) {
      try {
        console.log('Processing target progress update for approved progress report:', {
          progress_report_id: req.params.id,
          amount: report.amount,
          user_id: report.created_by
        });
        
        // Find active target for the creator
        const target = await db.get(
          'SELECT * FROM targets WHERE user_id = ? AND status = ?',
          [report.created_by, 'Active']
        );

        if (target) {
          console.log('Found active target:', { target_id: target.id, user_id: report.created_by });
          
          // Check if progress already recorded for this report (use integer for DB compatibility)
          const progressReportIdInt = parseInt(req.params.id, 10);
          const existingProgress = await db.get(
            'SELECT id FROM target_progress WHERE progress_report_id = ?',
            [progressReportIdInt]
          );

          if (!existingProgress) {
            // Create new progress record
            // Ensure target_id is an integer
            const targetIdInt = parseInt(target.id);
            const userIdInt = parseInt(report.created_by);
            const amountFloat = parseFloat(report.amount);
            
            console.log('Creating target_progress record with:', {
              target_id: targetIdInt,
              user_id: userIdInt,
              progress_report_id: req.params.id,
              amount: amountFloat,
              category: report.category,
              status: report.status,
              date: report.date
            });
            
            // When progress report is approved, target_progress should also be 'Approved'
            // Ensure status is exactly 'Approved' (capitalized)
            const progressStatus = status === 'Approved' ? 'Approved' : 'Pending';
            
            console.log('Creating target_progress entry with:', {
              target_id: targetIdInt,
              user_id: userIdInt,
              progress_report_id: req.params.id,
              amount: amountFloat,
              status: progressStatus,
              category: report.category
            });
            
            const progressResult = await db.run(
              `INSERT INTO target_progress (target_id, user_id, progress_report_id, amount, category, status, transaction_date)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
              [
                targetIdInt,
                userIdInt,
                req.params.id,
                amountFloat,
                report.category || null,
                progressStatus, // Use exactly 'Approved' or 'Pending'
                report.date || null
              ]
            );
            
            const progressId = progressResult.lastID || progressResult.id || (progressResult.rows && progressResult.rows[0] && progressResult.rows[0].id);
            
            console.log('Target progress created successfully:', {
              progress_id: progressId,
              target_id: targetIdInt,
              user_id: userIdInt,
              amount: amountFloat,
              result: progressResult
            });
            
            // Wait longer for database commit (especially for PostgreSQL)
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Verify the record was created and can be found
            const verifyProgress = await db.get(
              'SELECT * FROM target_progress WHERE id = ?',
              [progressId]
            );
            console.log('Verified target_progress record by ID:', {
              found: !!verifyProgress,
              id: verifyProgress?.id,
              target_id: verifyProgress?.target_id,
              amount: verifyProgress?.amount,
              status: verifyProgress?.status,
              progress_report_id: verifyProgress?.progress_report_id
            });
            
            // Log the actual status value saved
            const savedProgress = await db.get(
              'SELECT id, amount, status FROM target_progress WHERE id = ?',
              [progressId]
            );
            console.log('Saved progress entry details:', {
              id: savedProgress?.id,
              amount: savedProgress?.amount,
              status: savedProgress?.status,
              status_type: typeof savedProgress?.status,
              status_length: savedProgress?.status?.length,
              expected_status: progressStatus
            });
            
            // Verify this entry is found by the calculation query
            const calcTest = await db.get(
              `SELECT 
                 CASE 
                   WHEN status = 'Approved' OR UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' OR status IS NULL OR status = ''
                   THEN 'MATCH'
                   ELSE 'NO_MATCH'
                 END as match_result,
                 amount as entry_amount
               FROM target_progress
               WHERE id = ?`,
              [progressId]
            );
            console.log('Calculation query test for progress entry:', calcTest);
            
            // Update admin target in database when staff/dept head target progress changes
            try {
              const { updateAdminTarget } = require('./targets');
              if (typeof updateAdminTarget === 'function') {
                // Get the target's period_start to update the correct admin target
                const targetInfo = await db.get('SELECT period_start FROM targets WHERE id = ?', [targetIdInt]);
                if (targetInfo && targetInfo.period_start) {
                  await updateAdminTarget(targetInfo.period_start);
                  console.log('Admin target updated after progress report approval');
                }
              }
            } catch (adminUpdateError) {
              console.error('Error updating admin target after progress approval (non-fatal):', adminUpdateError);
            }
            
            // Emit real-time update for target progress - emit to ALL users so everyone sees the update
            if (global.io) {
              // Emit a general update event with consistent data types
              const updateData = {
                target_id: targetIdInt,
                user_id: userIdInt,
                amount: amountFloat,
                progress_report_id: parseInt(req.params.id),
                total_progress: parseFloat(totalProgressCheck?.total || 0),
                action: 'progress_added',
                progress_id: progressId
              };
              
              // Use calculateTargetMetrics from targets route for consistent calculations
              let fullMetrics;
              try {
                const targetsModule = require('./targets');
                // Get fresh target data after progress entry creation
                const freshTarget = await db.get('SELECT * FROM targets WHERE id = ?', [targetIdInt]);
                if (freshTarget && targetsModule.calculateTargetMetrics) {
                  fullMetrics = await targetsModule.calculateTargetMetrics(freshTarget);
                  console.log('Calculated metrics using calculateTargetMetrics for target', targetIdInt, ':', fullMetrics);
                } else {
                  throw new Error('calculateTargetMetrics not available');
                }
              } catch (metricsError) {
                console.error('Error using calculateTargetMetrics, falling back to manual:', metricsError);
                // Fallback
                fullMetrics = {
                  total_progress: parseFloat(totalProgressCheck?.total || 0),
                  shared_in: 0,
                  shared_out: 0,
                  net_amount: parseFloat(totalProgressCheck?.total || 0),
                  progress_percentage: '0.00',
                  remaining_amount: 0
                };
              }
              
              // Emit with full metrics
              global.io.emit('target_progress_updated', {
                ...updateData,
                ...fullMetrics
              });
              console.log('Emitted target_progress_updated event with full metrics:', { ...updateData, ...fullMetrics });
              
              // Also emit target_updated with full metrics
              global.io.emit('target_updated', {
                id: targetIdInt,
                updated_by: req.user.name || 'Admin',
                reason: 'progress_report_approved',
                progress_added: true,
                ...fullMetrics
              });
              console.log('Emitted target_updated event for target with full metrics:', targetIdInt);
            }
          } else {
            // Update existing progress record - when progress report is approved, set status to Approved
            // Ensure status is exactly 'Approved' (capitalized)
            const normalizedStatus = status === 'Approved' ? 'Approved' : 'Rejected';
            
            console.log('Updating target_progress entry with:', {
              progress_report_id: req.params.id,
              amount: parseFloat(report.amount || 0),
              status: normalizedStatus,
              category: report.category
            });
            
            const progressReportIdInt = parseInt(req.params.id, 10);
            await db.run(
              `UPDATE target_progress 
               SET amount = ?, category = ?, status = ?, transaction_date = ?
               WHERE progress_report_id = ?`,
              [
                parseFloat(report.amount || 0),
                report.category,
                normalizedStatus, // Use exactly 'Approved' or 'Rejected'
                report.date,
                progressReportIdInt
              ]
            );
            
            // Wait a moment for database commit (especially for PostgreSQL)
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Verify the update was successful
            const verifyUpdatedProgress = await db.get(
              'SELECT id, amount, status FROM target_progress WHERE progress_report_id = ?',
              [progressReportIdInt]
            );
            
            console.log('Target progress updated successfully for progress report:', {
              progress_report_id: req.params.id,
              target_progress_id: verifyUpdatedProgress?.id,
              amount: verifyUpdatedProgress?.amount,
              status: verifyUpdatedProgress?.status,
              status_type: typeof verifyUpdatedProgress?.status,
              expected_status: normalizedStatus
            });
            
            // Check status match
            const statusMatchCheck = await db.get(
              `SELECT 
                 CASE 
                   WHEN status = 'Approved' THEN 'MATCH_APPROVED'
                   WHEN UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' THEN 'MATCH_NORMALIZED'
                   WHEN status IS NULL THEN 'MATCH_NULL'
                   WHEN status = '' THEN 'MATCH_EMPTY'
                   ELSE 'NO_MATCH'
                 END as match_type,
                 status as raw_status
               FROM target_progress WHERE progress_report_id = ?`,
              [progressReportIdInt]
            );
            console.log('Status match check for updated progress entry:', statusMatchCheck);
            
            // Verify the updated progress (only Approved entries, same as GET /targets)
            const totalProgressCheck = await db.get(
              `SELECT COALESCE(SUM(CASE 
                 WHEN status = 'Approved' OR UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' OR status IS NULL OR status = ''
                 THEN COALESCE(CAST(amount AS NUMERIC), 0)
                 ELSE 0
               END), 0) as total,
               COUNT(CASE 
                 WHEN status = 'Approved' OR UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' OR status IS NULL OR status = ''
                 THEN 1
               END) as count 
               FROM target_progress 
               WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)`,
              [target.id]
            );
            console.log('Total progress after update for target', target.id, ':', {
              total: totalProgressCheck?.total || 0,
              count: totalProgressCheck?.count || 0,
              expected_amount: parseFloat(report.amount || 0)
            });
            
            // Get all entries for debugging
            const allProgressEntries = await db.all(
              `SELECT id, amount, status, 
                      UPPER(TRIM(COALESCE(status, ''))) as normalized_status
               FROM target_progress
               WHERE target_id = ?
               ORDER BY id`,
              [target.id]
            );
            console.log('ALL progress entries for target', target.id, 'after update:', JSON.stringify(allProgressEntries, null, 2));
            
            // Use calculateTargetMetrics from targets route for consistent calculations
            let fullMetrics;
            try {
                const targetsModule = require('./targets');
              // Get fresh target data after progress entry update
              const freshTarget = await db.get('SELECT * FROM targets WHERE id = ?', [target.id]);
              if (freshTarget && targetsModule.calculateTargetMetrics) {
                fullMetrics = await targetsModule.calculateTargetMetrics(freshTarget);
                console.log('Calculated metrics using calculateTargetMetrics for target', target.id, ':', fullMetrics);
              } else {
                throw new Error('calculateTargetMetrics not available');
              }
            } catch (metricsError) {
              console.error('Error using calculateTargetMetrics, falling back to manual:', metricsError);
              // Fallback
              fullMetrics = {
                total_progress: parseFloat(totalProgressCheck?.total || 0),
                shared_in: 0,
                shared_out: 0,
                net_amount: parseFloat(totalProgressCheck?.total || 0),
                progress_percentage: '0.00',
                remaining_amount: parseFloat(target.target_amount || 0)
              };
            }
            
            // Emit real-time update for INDIVIDUAL target FIRST - emit to ALL users with full metrics
            if (global.io) {
              const individualTargetEvent = {
                target_id: target.id,
                user_id: report.created_by,
                progress_report_id: req.params.id,
                action: 'progress_approved',
                status: normalizedStatus,
                ...fullMetrics
              };
              
              global.io.emit('target_progress_updated', individualTargetEvent);
              console.log('Emitted target_progress_updated event for INDIVIDUAL target:', individualTargetEvent);
              
              // Also emit target_updated with full metrics
              const targetUpdatedEvent = {
                id: target.id,
                updated_by: req.user.name || 'Admin',
                reason: 'progress_report_approved',
                ...fullMetrics
              };
              global.io.emit('target_updated', targetUpdatedEvent);
              console.log('Emitted target_updated event for INDIVIDUAL target:', targetUpdatedEvent);
            }
            
            // Update admin target AFTER individual target event (run in background to not block)
            setImmediate(async () => {
              try {
                // Get the target's period_start to update the correct admin target
                const targetInfo = await db.get('SELECT period_start FROM targets WHERE id = ?', [target.id]);
                if (targetInfo) {
                  const targetsModule = require('./targets');
                  if (targetsModule && typeof targetsModule.updateAdminTarget === 'function') {
                    await targetsModule.updateAdminTarget(targetInfo.period_start);
                    console.log('Admin target updated after progress report approval (update case)');
                  }
                }
              } catch (adminUpdateError) {
                console.error('Error updating admin target after progress approval (non-fatal):', adminUpdateError);
              }
            });
          }
        } else {
          console.log('No active target found for user:', report.created_by);
        }
      } catch (targetError) {
        // Log but don't fail the approval if target update fails
        console.error('Error updating target progress after approval:', targetError);
      }
    }

    // Send notification to creator (don't fail if notification fails)
    try {
      const { sendNotificationToUser } = require('../utils/notifications');
      await sendNotificationToUser(report.created_by, {
        title: `Progress Report ${status}`,
        message: `Your progress report "${report.name || 'Untitled'}" has been ${status.toLowerCase()}`,
        link: `/progress-reports/${req.params.id}`,
        type: status === 'Approved' ? 'success' : 'warning',
        senderId: req.user.id
      });
    } catch (notifError) {
      console.error('Error sending notification (non-fatal):', notifError);
      // Continue even if notification fails
    }

    // Emit real-time update for progress report
    if (global.io) {
      try {
        global.io.emit('progress_report_updated', {
          id: req.params.id,
          status: status,
          reviewed_by: req.user.name || req.user.email || 'Admin',
          amount: report.amount
        });
        
        // Also emit progress_report_approved event for frontend
        global.io.emit('progress_report_approved', {
          id: req.params.id,
          status: status,
          reviewed_by: req.user.name || req.user.email || 'Admin',
          amount: report.amount,
          user_id: report.created_by
        });
      } catch (emitError) {
        console.error('Error emitting socket events (non-fatal):', emitError);
        // Continue even if socket emit fails
      }
    }

    res.json({ 
      message: `Progress report ${status.toLowerCase()} successfully`,
      report: {
        id: req.params.id,
        status: status,
        amount: report.amount
      }
    });
  } catch (error) {
    console.error('Approve progress report error:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      code: error.code,
      errno: error.errno,
      sql: error.sql
    });
    
    // Provide more specific error messages
    let errorMessage = 'Failed to approve progress report';
    if (error.message && error.message.includes('FOREIGN KEY')) {
      errorMessage = 'Database constraint error. Please ensure all related records exist.';
    } else if (error.message && error.message.includes('NOT NULL')) {
      errorMessage = 'Required field is missing.';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Delete progress report (Admin only - deletes for everyone in the system)
router.delete('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const report = await db.get('SELECT * FROM progress_reports WHERE id = ?', [req.params.id]);
    if (!report) {
      return res.status(404).json({ error: 'Progress report not found' });
    }

    // Delete associated target_progress entry if it exists
    try {
      const targetProgress = await db.get(
        'SELECT id, target_id FROM target_progress WHERE progress_report_id = ?',
        [req.params.id]
      );
      
      if (targetProgress) {
        // Delete the target_progress entry
        await db.run('DELETE FROM target_progress WHERE progress_report_id = ?', [req.params.id]);
        
        // Update the associated target metrics by recalculating
        const target = await db.get('SELECT * FROM targets WHERE id = ?', [targetProgress.target_id]);
        if (target) {
          const targetsModule = require('./targets');
          if (targetsModule && typeof targetsModule.calculateTargetMetrics === 'function') {
            // Recalculate target metrics
            const updatedMetrics = await targetsModule.calculateTargetMetrics(target);
            
            // Emit update event for the target
            if (global.io) {
              global.io.emit('target_progress_updated', {
                target_id: target.id,
                action: 'progress_report_deleted',
                progress_report_id: req.params.id,
                ...updatedMetrics
              });
              
              global.io.emit('target_updated', {
                id: target.id,
                updated_by: req.user.name || 'Admin',
                reason: 'progress_report_deleted',
                ...updatedMetrics
              });
            }
            
            // Update admin target if this wasn't admin's own target
            const adminUser = await db.get("SELECT id FROM users WHERE role = 'Admin' LIMIT 1");
            if (adminUser && target.user_id !== adminUser.id && target.period_start) {
              const { updateAdminTarget } = require('./targets');
              if (updateAdminTarget) {
                updateAdminTarget(target.period_start).catch(err => 
                  console.error('Error updating admin target after progress report deletion:', err)
                );
              }
            }
          }
        }
      }
    } catch (targetProgressError) {
      console.error('Error deleting target_progress entry (non-fatal):', targetProgressError);
      // Continue with progress report deletion even if target_progress deletion fails
    }

    // Delete the progress report
    await db.run('DELETE FROM progress_reports WHERE id = ?', [req.params.id]);
    await logAction(req.user.id, 'delete_progress_report', 'progress_reports', req.params.id, {
      report_name: report.name,
      report_amount: report.amount,
      created_by: report.created_by
    }, req);

    // Emit real-time event to notify all users that the progress report has been deleted
    if (global.io) {
      global.io.emit('progress_report_deleted', {
        id: req.params.id,
        name: report.name,
        amount: report.amount,
        created_by: report.created_by,
        deleted_by: req.user.id,
        deleted_by_name: req.user.name || 'Admin',
        deleted_at: new Date().toISOString()
      });
      console.log('Emitted progress_report_deleted event for report:', req.params.id);
    }

    res.json({ message: 'Progress report deleted successfully. All associated data has been removed.' });
  } catch (error) {
    console.error('Delete progress report error:', error);
    res.status(500).json({ error: 'Failed to delete progress report' });
  }
});

module.exports = router;

