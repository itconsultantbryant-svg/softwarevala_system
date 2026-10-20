const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const { sendNotificationToUser, sendNotificationToRole } = require('../utils/notifications');
const { archiveDocumentFromActivity } = require('./archivedDocuments');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getUploadsRoot } = require('../utils/uploadsRoot');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(getUploadsRoot(), 'requisitions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'req-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, Word, Excel, PowerPoint, Text, Images'));
    }
  }
});

// Get all requisitions (users see their own, admin sees all)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        r.*,
        u.name as user_name,
        u.email as user_email,
        d.name as department_name,
        dept_head.name as dept_head_reviewer_name,
        admin.name as admin_reviewer_name,
        target.name as target_user_name
      FROM requisitions r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN departments d ON r.department_id = d.id
      LEFT JOIN users dept_head ON r.dept_head_reviewed_by = dept_head.id
      LEFT JOIN users admin ON r.admin_reviewed_by = admin.id
      LEFT JOIN users target ON r.target_user_id = target.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Filter based on user role
    if (req.user.role === 'Admin') {
      // Admin sees all requisitions
    } else if (req.user.role === 'DepartmentHead') {
      // Check if head_email column exists
      const USE_POSTGRESQL = !!process.env.DATABASE_URL;
      let deptTableInfo;
      if (USE_POSTGRESQL) {
        deptTableInfo = await db.all("SELECT column_name as name FROM information_schema.columns WHERE table_name = 'departments'");
      } else {
        deptTableInfo = await db.all("PRAGMA table_info(departments)");
      }
      const deptColumnNames = deptTableInfo.map(col => col.name);
      const hasHeadEmail = deptColumnNames.includes('head_email');
      
      // Check if this is Finance Department Head
      let financeDept;
      if (hasHeadEmail) {
        financeDept = await db.get(
          "SELECT id, name FROM departments WHERE (manager_id = ? OR LOWER(TRIM(head_email)) = ?) AND LOWER(name) LIKE '%finance%'",
          [req.user.id, req.user.email.toLowerCase().trim()]
        );
      } else {
        financeDept = await db.get(
          "SELECT id, name FROM departments WHERE manager_id = ? AND LOWER(name) LIKE '%finance%'",
          [req.user.id]
        );
      }
      
      if (financeDept) {
        // Finance Department Head sees:
        // 1. ALL office supplies requisitions pending their approval (from any department)
        // 2. Office supplies they've approved/rejected
        query += ` AND r.request_type = ? 
                    AND ((r.status = ?)
                         OR (r.status IN (?, ?, ?) AND r.dept_head_reviewed_by = ?)
                         OR (r.status = ? AND r.dept_head_reviewed_by = ?))`;
        params.push(
          'office_supplies',
          'Pending_DeptHead',
          'Pending_Admin', 'Admin_Approved', 'Admin_Rejected',
          req.user.id,
          'DeptHead_Rejected',
          req.user.id
        );
      } else {
        // Non-Finance Department Heads only see their own requisitions
        if (USE_POSTGRESQL) {
          query += ' AND CAST(r.user_id AS INTEGER) = CAST(? AS INTEGER)';
        } else {
          query += ' AND r.user_id = ?';
        }
        params.push(req.user.id);
      }
    } else {
      // Regular users see:
      // 1. Their own requisitions (as sender)
      // 2. Work support requisitions where they are the recipient (target_user_id)
      const USE_POSTGRESQL = !!process.env.DATABASE_URL;
      if (USE_POSTGRESQL) {
        query += ' AND (CAST(r.user_id AS INTEGER) = CAST(? AS INTEGER) OR (r.request_type = ? AND CAST(r.target_user_id AS INTEGER) = CAST(? AS INTEGER)))';
      } else {
        query += ' AND (r.user_id = ? OR (r.request_type = ? AND r.target_user_id = ?))';
      }
      params.push(req.user.id, 'work_support', req.user.id);
    }
    
    query += ' ORDER BY r.requisition_date DESC, r.created_at DESC';
    
    console.log('Fetching requisitions for user:', {
      user_id: req.user.id,
      role: req.user.role,
      email: req.user.email,
      query: query.substring(0, 200) + '...',
      params: params
    });
    
    const requisitions = await db.all(query, params);
    
    console.log(`Found ${requisitions.length} requisitions for user ${req.user.id} (${req.user.role})`);
    if (requisitions.length > 0) {
      console.log('Sample requisition:', {
        id: requisitions[0].id,
        user_id: requisitions[0].user_id,
        status: requisitions[0].status,
        request_type: requisitions[0].request_type
      });
    }
    
    res.json({ requisitions });
  } catch (error) {
    console.error('Get requisitions error:', error);
    // Handle missing table gracefully
    if (error.message && error.message.includes('no such table')) {
      console.warn('requisitions table does not exist yet');
      return res.json({ requisitions: [] });
    }
    res.status(500).json({ error: 'Failed to fetch requisitions: ' + error.message });
  }
});

// Get single requisition
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        r.*,
        u.name as user_name,
        u.email as user_email,
        d.name as department_name,
        dept_head.name as dept_head_reviewer_name,
        admin.name as admin_reviewer_name,
        target.name as target_user_name
      FROM requisitions r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN departments d ON r.department_id = d.id
      LEFT JOIN users dept_head ON r.dept_head_reviewed_by = dept_head.id
      LEFT JOIN users admin ON r.admin_reviewed_by = admin.id
      LEFT JOIN users target ON r.target_user_id = target.id
      WHERE r.id = ?
    `;
    
    const params = [req.params.id];
    
    // Filter based on user role
    if (req.user.role === 'Admin') {
      // Admin can see all requisitions
    } else if (req.user.role === 'DepartmentHead') {
      // Check if this is Finance Department Head
      const USE_POSTGRESQL = !!process.env.DATABASE_URL;
      let deptTableInfo;
      if (USE_POSTGRESQL) {
        deptTableInfo = await db.all("SELECT column_name as name FROM information_schema.columns WHERE table_name = 'departments'");
      } else {
        deptTableInfo = await db.all("PRAGMA table_info(departments)");
      }
      const deptColumnNames = deptTableInfo.map(col => col.name);
      const hasHeadEmail = deptColumnNames.includes('head_email');
      
      let financeDept;
      if (hasHeadEmail) {
        financeDept = await db.get(
          "SELECT id, name FROM departments WHERE (manager_id = ? OR LOWER(TRIM(head_email)) = ?) AND LOWER(name) LIKE '%finance%'",
          [req.user.id, req.user.email.toLowerCase().trim()]
        );
      } else {
        financeDept = await db.get(
          "SELECT id, name FROM departments WHERE manager_id = ? AND LOWER(name) LIKE '%finance%'",
          [req.user.id]
        );
      }
      
      if (financeDept) {
        // Finance Department Head can view ALL office supplies requisitions (from any department)
        // For other requisition types, they can only see their own
        query += ' AND (r.request_type = ? OR r.user_id = ?)';
        params.push('office_supplies', req.user.id);
      } else {
        // Non-Finance Department Heads can only see requisitions from their department or their own
        const dept = await db.get(
          'SELECT id, name FROM departments WHERE manager_id = ? OR LOWER(TRIM(head_email)) = ?',
          [req.user.id, req.user.email.toLowerCase().trim()]
        );
        
        if (dept) {
          query += ' AND (r.department_id = ? OR LOWER(TRIM(r.department_name)) = ? OR r.user_id = ?)';
          params.push(dept.id, dept.name.toLowerCase().trim(), req.user.id);
        } else {
          query += ' AND r.user_id = ?';
          params.push(req.user.id);
        }
      }
    } else {
      // Regular users can only see their own requisitions or work support where they are recipient
      const USE_POSTGRESQL = !!process.env.DATABASE_URL;
      if (USE_POSTGRESQL) {
        query += ' AND (CAST(r.user_id AS INTEGER) = CAST(? AS INTEGER) OR (r.request_type = ? AND CAST(r.target_user_id AS INTEGER) = CAST(? AS INTEGER)))';
      } else {
        query += ' AND (r.user_id = ? OR (r.request_type = ? AND r.target_user_id = ?))';
      }
      params.push(req.user.id, 'work_support', req.user.id);
    }
    
    const requisition = await db.get(query, params);
    
    if (!requisition) {
      return res.status(404).json({ error: 'Requisition not found' });
    }
    
    res.json({ requisition });
  } catch (error) {
    console.error('Get requisition error:', error);
    res.status(500).json({ error: 'Failed to fetch requisition: ' + error.message });
  }
});

// Create requisition
router.post('/', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const {
      requisition_date,
      request_type,
      materials,
      cost,
      quantity,
      purpose,
      period_from,
      period_to,
      leave_purpose,
      target_user_id,
      target_role
    } = req.body;

    // Validation
    if (!requisition_date || !request_type) {
      return res.status(400).json({ error: 'Date and request type are required' });
    }

    // Validate request type
    const validRequestTypes = ['office_supplies', 'work_support', 'sick_leave', 'temporary_leave', 'vacation', 'annual_leave'];
    if (!validRequestTypes.includes(request_type)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    // Get user info
    const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const userName = user?.name || req.user.name || req.user.email;

    // Get department info
    let departmentId = null;
    let departmentName = null;
    if (req.user.role === 'Staff') {
      const staff = await db.get('SELECT department FROM staff WHERE user_id = ?', [req.user.id]);
      if (staff && staff.department) {
        // Try to find department by name
        const dept = await db.get('SELECT id, name FROM departments WHERE LOWER(TRIM(name)) = ?', [staff.department.toLowerCase().trim()]);
        if (dept) {
          departmentId = dept.id;
          departmentName = dept.name;
        } else {
          // If department not found in departments table, just use the name
          departmentName = staff.department;
        }
      }
    } else if (req.user.role === 'DepartmentHead') {
      const dept = await db.get(
        'SELECT id, name FROM departments WHERE manager_id = ? OR LOWER(TRIM(head_email)) = ?',
        [req.user.id, req.user.email.toLowerCase().trim()]
      );
      if (dept) {
        departmentId = dept.id;
        departmentName = dept.name;
      }
    }

    // Simplified workflow:
    // - work_support: auto Approved (no approval, goes directly to staff)
    // - all other types: Pending_Admin (Admin-only approval, no department head approval)
    let initialStatus = request_type === 'work_support' ? 'Approved' : 'Pending_Admin';

    const document_path = req.file ? `/uploads/requisitions/${req.file.filename}` : null;
    const document_name = req.file ? req.file.originalname : null;

    // Clean up target_user_id and target_role (convert empty strings to null)
    const cleanTargetUserId = target_user_id && target_user_id.trim() !== '' ? parseInt(target_user_id) : null;
    const cleanTargetRole = target_role && target_role.trim() !== '' ? target_role : null;

    // Parse cost and quantity safely
    const parsedCost = cost && cost.toString().trim() !== '' ? parseFloat(cost) : null;
    const parsedQuantity = quantity && quantity.toString().trim() !== '' ? parseInt(quantity) : null;

    try {
      let result;
      try {
        result = await db.run(`
          INSERT INTO requisitions (
            user_id, user_name, department_id, department_name,
            requisition_date, request_type,
            materials, cost, quantity,
            purpose,
            period_from, period_to, leave_purpose,
            document_path, document_name,
            target_user_id, target_role,
            status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          req.user.id, userName, departmentId, departmentName,
          requisition_date, request_type,
          materials && materials.trim() !== '' ? materials : null,
          parsedCost,
          parsedQuantity,
          purpose && purpose.trim() !== '' ? purpose : null,
          period_from && period_from.trim() !== '' ? period_from : null,
          period_to && period_to.trim() !== '' ? period_to : null,
          leave_purpose && leave_purpose.trim() !== '' ? leave_purpose : null,
          document_path, document_name,
          cleanTargetUserId,
          cleanTargetRole,
          initialStatus
        ]);
      } catch (insertError) {
        // If constraint violation, try to fix the constraint and retry
        if (insertError.message && insertError.message.includes('check constraint') && insertError.message.includes('requisitions_status_check')) {
          console.log('Constraint violation detected, attempting to update constraint...');
          const USE_POSTGRESQL = !!process.env.DATABASE_URL;
          
          if (USE_POSTGRESQL) {
            try {
              // Find and drop the existing constraint
              const constraint = await db.get(`
                SELECT constraint_name 
                FROM information_schema.table_constraints 
                WHERE table_name = 'requisitions' 
                AND constraint_type = 'CHECK'
                AND constraint_name LIKE '%status%'
              `);
              
              if (constraint) {
                await db.run(`ALTER TABLE requisitions DROP CONSTRAINT ${constraint.constraint_name}`);
              } else {
                // Try common constraint names
                const constraintNames = ['requisitions_status_check', 'requisitions_status_chk', 'check_status'];
                for (const constraintName of constraintNames) {
                  try {
                    await db.run(`ALTER TABLE requisitions DROP CONSTRAINT IF EXISTS ${constraintName}`);
                  } catch (e) {
                    // Ignore if doesn't exist
                  }
                }
              }
              
              // Add new constraint with all status values including 'Approved'
              await db.run(`
                ALTER TABLE requisitions 
                ADD CONSTRAINT requisitions_status_check 
                CHECK (status IN ('Pending_DeptHead', 'DeptHead_Approved', 'DeptHead_Rejected', 'Pending_Admin', 'Admin_Approved', 'Admin_Rejected', 'Approved'))
              `);
              console.log('✓ Updated requisitions status constraint to include Approved');
              
              // Retry the insert
              result = await db.run(`
                INSERT INTO requisitions (
                  user_id, user_name, department_id, department_name,
                  requisition_date, request_type,
                  materials, cost, quantity,
                  purpose,
                  period_from, period_to, leave_purpose,
                  document_path, document_name,
                  target_user_id, target_role,
                  status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                req.user.id, userName, departmentId, departmentName,
                requisition_date, request_type,
                materials && materials.trim() !== '' ? materials : null,
                parsedCost,
                parsedQuantity,
                purpose && purpose.trim() !== '' ? purpose : null,
                period_from && period_from.trim() !== '' ? period_from : null,
                period_to && period_to.trim() !== '' ? period_to : null,
                leave_purpose && leave_purpose.trim() !== '' ? leave_purpose : null,
                document_path, document_name,
                cleanTargetUserId,
                cleanTargetRole,
                initialStatus
              ]);
            } catch (constraintError) {
              console.error('Error updating constraint:', constraintError);
              throw insertError; // Re-throw original error
            }
          } else {
            // SQLite doesn't support ALTER TABLE to modify CHECK constraints
            // We'll need to recreate the table or handle it differently
            console.error('SQLite constraint violation - cannot modify CHECK constraint dynamically');
            throw insertError;
          }
        } else {
          throw insertError;
        }
      }

      if (!result || !result.lastID) {
        throw new Error('Failed to insert requisition: No lastID returned');
      }

      const newRequisition = await db.get('SELECT * FROM requisitions WHERE id = ?', [result.lastID]);
      
      if (!newRequisition) {
        throw new Error('Failed to retrieve created requisition');
      }

      // Archive the document if uploaded
      if (document_path) {
        try {
          await archiveDocumentFromActivity(
            req.user.id,
            document_path,
            document_name,
            'requisition',
            newRequisition.id,
            `Requisition document: ${request_type.replace('_', ' ')} - ${userName}`,
            req.user.id
          );
        } catch (archiveError) {
          console.error('Error archiving requisition document:', archiveError);
          // Don't fail the request if archiving fails
        }
      }

    // Send real-time notifications
    try {
      // Notify creator
      await sendNotificationToUser(req.user.id, {
        title: 'Requisition Submitted',
        message: `Your ${request_type.replace('_', ' ')} requisition has been submitted successfully`,
        link: `/requisitions/${result.lastID}`,
        type: 'success',
        senderId: req.user.id
      });

      // Handle notifications based on request type
      // All requisitions (except work_support) now go directly to Admin - no department head approval
      if (['office_supplies', 'sick_leave', 'temporary_leave', 'annual_leave'].includes(request_type)) {
        // All non-work_support requisitions: Notify Admin directly (no department head approval)
          await sendNotificationToRole('Admin', {
          title: 'New Requisition for Approval',
          message: `${userName} has submitted a ${request_type.replace('_', ' ')} requisition that requires your approval`,
          link: `/requisitions/${result.lastID}`,
          type: 'info',
          senderId: req.user.id
        });
      } else if (request_type === 'work_support') {
        // Work support: Notify recipient if specified
        if (cleanTargetUserId) {
          await sendNotificationToUser(cleanTargetUserId, {
            title: 'New Work Support Request',
            message: `${userName} has sent you a work support request`,
            link: `/requisitions/${result.lastID}`,
            type: 'info',
            senderId: req.user.id
          });
          console.log(`Notified work support recipient (ID: ${cleanTargetUserId})`);
        }
        // Also notify Admin for visibility
        await sendNotificationToRole('Admin', {
          title: 'New Work Support Requisition',
          message: `${userName} has submitted a work support requisition${cleanTargetUserId ? ` for a user` : ''}`,
          link: `/requisitions/${result.lastID}`,
          type: 'info',
          senderId: req.user.id
        });
      }
    } catch (notifError) {
      console.error('Error sending notifications:', notifError);
    }

      // Emit real-time update
      if (global.io) {
        global.io.emit('requisition_created', {
          requisition: newRequisition,
          user_id: req.user.id,
          user_name: userName
        });
        console.log('Emitted requisition_created event');
      }

      res.status(201).json({ 
        message: 'Requisition submitted successfully',
        requisition: newRequisition 
      });
    } catch (dbError) {
      console.error('Database error creating requisition:', dbError);
      // If file was uploaded but DB insert failed, clean up the file
      if (req.file) {
        const fs = require('fs');
        const path = require('path');
        const filePath = path.join(getUploadsRoot(), 'requisitions', req.file.filename);
        try {
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
          }
        } catch (unlinkError) {
          console.error('Error deleting uploaded file:', unlinkError);
        }
      }
      throw dbError;
    }
  } catch (error) {
    console.error('Create requisition error:', error);
    res.status(500).json({ 
      error: 'Failed to create requisition: ' + (error.message || 'Unknown error'),
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Update requisition (only creator, and only if not yet approved)
router.put('/:id', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const requisition = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);
    if (!requisition) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    // Only creator can update
    if (requisition.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only update your own requisitions' });
    }

    // Cannot update if already approved or rejected
    if (['Admin_Approved', 'Admin_Rejected', 'DeptHead_Approved'].includes(requisition.status)) {
      return res.status(400).json({ error: 'Cannot update requisition that has been approved or rejected' });
    }

    const {
      requisition_date,
      request_type,
      materials,
      cost,
      quantity,
      purpose,
      period_from,
      period_to,
      leave_purpose,
      target_user_id,
      target_role
    } = req.body;

    // Validation
    if (!requisition_date || !request_type) {
      return res.status(400).json({ error: 'Date and request type are required' });
    }

    // Validate request type
    const validRequestTypes = ['office_supplies', 'work_support', 'sick_leave', 'temporary_leave', 'vacation', 'annual_leave'];
    if (!validRequestTypes.includes(request_type)) {
      return res.status(400).json({ error: 'Invalid request type' });
    }

    // Get user info
    const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const userName = user?.name || req.user.name || req.user.email;

    // Get department info (same logic as create)
    let departmentId = null;
    let departmentName = null;
    if (req.user.role === 'Staff') {
      const staff = await db.get('SELECT department FROM staff WHERE user_id = ?', [req.user.id]);
      if (staff && staff.department) {
        const dept = await db.get('SELECT id, name FROM departments WHERE LOWER(TRIM(name)) = ?', [staff.department.toLowerCase().trim()]);
        if (dept) {
          departmentId = dept.id;
          departmentName = dept.name;
        } else {
          departmentName = staff.department;
        }
      }
    } else if (req.user.role === 'DepartmentHead') {
      const dept = await db.get(
        'SELECT id, name FROM departments WHERE manager_id = ? OR LOWER(TRIM(head_email)) = ?',
        [req.user.id, req.user.email.toLowerCase().trim()]
      );
      if (dept) {
        departmentId = dept.id;
        departmentName = dept.name;
      }
    }

    // Determine status (reset to initial status if updating - all go to Admin directly, no dept head approval)
    const newStatus = request_type === 'work_support' ? 'Approved' : 'Pending_Admin';

    // Handle document upload
    let document_path = requisition.document_path;
    let document_name = requisition.document_name;
    
    if (req.file) {
      // Delete old document if exists
      if (requisition.document_path) {
        const oldFilePath = path.join(__dirname, '../..', requisition.document_path);
        if (fs.existsSync(oldFilePath)) {
          fs.unlinkSync(oldFilePath);
        }
      }
      document_path = `/uploads/requisitions/${req.file.filename}`;
      document_name = req.file.originalname;
    }

    // Clean up target_user_id and target_role
    const cleanTargetUserId = target_user_id && target_user_id.trim() !== '' ? parseInt(target_user_id) : null;
    const cleanTargetRole = target_role && target_role.trim() !== '' ? target_role : null;

    // Parse cost and quantity safely
    const parsedCost = cost && cost.toString().trim() !== '' ? parseFloat(cost) : null;
    const parsedQuantity = quantity && quantity.toString().trim() !== '' ? parseInt(quantity) : null;

    await db.run(`
      UPDATE requisitions SET
        user_name = ?,
        department_id = ?,
        department_name = ?,
        requisition_date = ?,
        request_type = ?,
        materials = ?,
        cost = ?,
        quantity = ?,
        purpose = ?,
        period_from = ?,
        period_to = ?,
        leave_purpose = ?,
        document_path = ?,
        document_name = ?,
        target_user_id = ?,
        target_role = ?,
        status = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      userName, departmentId, departmentName,
      requisition_date, request_type,
      materials && materials.trim() !== '' ? materials : null,
      parsedCost,
      parsedQuantity,
      purpose && purpose.trim() !== '' ? purpose : null,
      period_from && period_from.trim() !== '' ? period_from : null,
      period_to && period_to.trim() !== '' ? period_to : null,
      leave_purpose && leave_purpose.trim() !== '' ? leave_purpose : null,
      document_path, document_name,
      cleanTargetUserId,
      cleanTargetRole,
      newStatus,
      req.params.id
    ]);

    const updated = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);

    // Archive the new document if uploaded during update
    if (req.file && document_path) {
      try {
        await archiveDocumentFromActivity(
          req.user.id,
          document_path,
          document_name,
          'requisition',
          updated.id,
          `Requisition document (updated): ${updated.request_type.replace('_', ' ')} - ${userName}`,
          req.user.id
        );
      } catch (archiveError) {
        console.error('Error archiving updated requisition document:', archiveError);
        // Don't fail the request if archiving fails
      }
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('requisition_updated', {
        requisition: updated,
        user_id: req.user.id,
        action: 'updated'
      });
      console.log('Emitted requisition_updated event');
    }

    res.json({ 
      message: 'Requisition updated successfully',
      requisition: updated 
    });
  } catch (error) {
    console.error('Update requisition error:', error);
    res.status(500).json({ error: 'Failed to update requisition: ' + error.message });
  }
});

// Department Head approval/rejection (for office supplies - Finance Head only)
router.put('/:id/dept-head-review', authenticateToken, requireRole('DepartmentHead'), async (req, res) => {
  try {
    const { status, dept_head_notes } = req.body;

    if (!['DeptHead_Approved', 'DeptHead_Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const requisition = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);
    if (!requisition) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    // Only office_supplies require Department Head (Finance Head) approval
    // Leave requests (sick_leave, temporary_leave, annual_leave) go directly to Admin
    // Work support doesn't need approval
    if (requisition.request_type !== 'office_supplies') {
      return res.status(400).json({ 
        error: `This requisition type (${requisition.request_type}) does not require Department Head approval. ${['sick_leave', 'temporary_leave', 'annual_leave'].includes(requisition.request_type) ? 'It goes directly to Admin.' : 'It does not require approval.'}` 
      });
    }

    // Verify user is Finance Department Head
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    let deptTableInfo;
    if (USE_POSTGRESQL) {
      deptTableInfo = await db.all("SELECT column_name as name FROM information_schema.columns WHERE table_name = 'departments'");
    } else {
      deptTableInfo = await db.all("PRAGMA table_info(departments)");
    }
    const deptColumnNames = deptTableInfo.map(col => col.name);
    const hasHeadEmail = deptColumnNames.includes('head_email');
    
    let financeDept;
    if (hasHeadEmail) {
      financeDept = await db.get(
        "SELECT id, name FROM departments WHERE (manager_id = ? OR LOWER(TRIM(head_email)) = ?) AND LOWER(name) LIKE '%finance%'",
        [req.user.id, req.user.email.toLowerCase().trim()]
      );
    } else {
      financeDept = await db.get(
        "SELECT id, name FROM departments WHERE manager_id = ? AND LOWER(name) LIKE '%finance%'",
        [req.user.id]
      );
    }
    
    if (!financeDept) {
      return res.status(403).json({ error: 'Only Finance Department Head can approve office supplies requisitions' });
    }

    // Finance Department Head can approve office supplies from ANY department (no department check needed)

    if (requisition.status !== 'Pending_DeptHead') {
      return res.status(400).json({ error: 'Requisition is not pending department head review' });
    }

    const nextStatus = status === 'DeptHead_Approved' ? 'Pending_Admin' : 'DeptHead_Rejected';

    await db.run(`
      UPDATE requisitions SET
        status = ?,
        dept_head_reviewed_by = ?,
        dept_head_reviewed_at = CURRENT_TIMESTAMP,
        dept_head_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [nextStatus, req.user.id, dept_head_notes || null, req.params.id]);

    const updated = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);

    // Emit real-time update
    if (global.io) {
      global.io.emit('requisition_status_updated', {
        requisition: updated,
        reviewer_id: req.user.id,
        reviewer_name: req.user.name || 'Finance Department Head',
        action: 'dept_head_review',
        status: nextStatus
      });
      console.log('Emitted requisition_status_updated event for dept head review');
    }

    // Send real-time notifications
    try {
      const creator = await db.get('SELECT id, name FROM users WHERE id = ?', [requisition.user_id]);
      const isApproved = status === 'DeptHead_Approved';
      
      // Notify creator
      if (creator) {
        await sendNotificationToUser(creator.id, {
          title: `Requisition ${isApproved ? 'Approved' : 'Rejected'}`,
          message: `Your ${requisition.request_type.replace('_', ' ')} requisition has been ${isApproved ? 'approved' : 'rejected'} by Department Head`,
          link: `/requisitions/${req.params.id}`,
          type: isApproved ? 'success' : 'warning',
          senderId: req.user.id
        });
      }

      // If approved, notify Admin
      if (isApproved) {
        await sendNotificationToRole('Admin', {
          title: 'Requisition Ready for Review',
          message: `A ${requisition.request_type.replace('_', ' ')} requisition has been approved by Department Head and requires your review`,
          link: `/requisitions/${req.params.id}`,
          type: 'info',
          senderId: req.user.id
        });
      }
    } catch (notifError) {
      console.error('Error sending notifications:', notifError);
    }

    res.json({ 
      message: `Requisition ${status === 'DeptHead_Approved' ? 'approved' : 'rejected'} by Department Head`,
      requisition: updated 
    });
  } catch (error) {
    console.error('Department head review error:', error);
    res.status(500).json({ error: 'Failed to review requisition: ' + error.message });
  }
});

// Admin approval/rejection (final approval)
router.put('/:id/admin-review', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const { status, admin_notes } = req.body;

    if (!['Admin_Approved', 'Admin_Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const requisition = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);
    if (!requisition) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    // Only leave types (sick_leave, temporary_leave, annual_leave) and office_supplies (after dept head approval) should reach admin
    // Work support doesn't need approval
    if (requisition.request_type === 'work_support') {
      return res.status(400).json({ error: 'Work support requisitions do not require approval' });
    }
    
    // Verify this requisition is in a state that requires admin approval
    // Leave types go directly to admin (Pending_Admin)
    // Office supplies go to admin after dept head approval (Pending_Admin)
    if (requisition.status !== 'Pending_Admin') {
      if (['sick_leave', 'temporary_leave', 'annual_leave'].includes(requisition.request_type)) {
        // Leave types should be Pending_Admin (direct to admin)
        return res.status(400).json({ error: `This leave requisition should be in Pending_Admin status. Current status: ${requisition.status}` });
      } else if (requisition.request_type === 'office_supplies') {
        // Office supplies need dept head approval first
        return res.status(400).json({ error: 'Office supplies requisitions must be approved by Finance Department Head before Admin can review' });
      } else {
        return res.status(400).json({ error: `Requisition is not in a state that requires admin approval. Current status: ${requisition.status}` });
      }
    }

    await db.run(`
      UPDATE requisitions SET
        status = ?,
        admin_reviewed_by = ?,
        admin_reviewed_at = CURRENT_TIMESTAMP,
        admin_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, req.user.id, admin_notes || null, req.params.id]);

    const updated = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);

    // Send real-time notifications
    try {
      const creator = await db.get('SELECT id, name FROM users WHERE id = ?', [requisition.user_id]);
      const isApproved = status === 'Admin_Approved';
      
      // Notify creator
      if (creator) {
        await sendNotificationToUser(creator.id, {
          title: `Requisition ${isApproved ? 'Approved' : 'Rejected'}`,
          message: `Your ${requisition.request_type.replace('_', ' ')} requisition has been ${isApproved ? 'approved' : 'rejected'} by Admin`,
          link: `/requisitions/${req.params.id}`,
          type: isApproved ? 'success' : 'warning',
          senderId: req.user.id
        });
      }

      // If Department Head reviewed it, notify them too
      if (requisition.dept_head_reviewed_by) {
        await sendNotificationToUser(requisition.dept_head_reviewed_by, {
          title: `Requisition ${isApproved ? 'Approved' : 'Rejected'}`,
          message: `The ${requisition.request_type.replace('_', ' ')} requisition you reviewed has been ${isApproved ? 'approved' : 'rejected'} by Admin`,
          link: `/requisitions/${req.params.id}`,
          type: isApproved ? 'success' : 'info',
          senderId: req.user.id
        });
      }
    } catch (notifError) {
      console.error('Error sending notifications:', notifError);
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('requisition_status_updated', {
        requisition: updated,
        reviewer_id: req.user.id,
        reviewer_name: req.user.name || 'Admin',
        action: status === 'Admin_Approved' ? 'admin_approved' : 'admin_rejected',
        previous_status: requisition.status,
        new_status: status
      });
      console.log('Emitted requisition_status_updated event for admin review');
    }

    res.json({ 
      message: `Requisition ${status === 'Admin_Approved' ? 'approved' : 'rejected'} by Admin`,
      requisition: updated 
    });
  } catch (error) {
    console.error('Admin review error:', error);
    res.status(500).json({ error: 'Failed to review requisition: ' + error.message });
  }
});

// Delete requisition (only creator or admin)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const requisition = await db.get('SELECT * FROM requisitions WHERE id = ?', [req.params.id]);
    if (!requisition) {
      return res.status(404).json({ error: 'Requisition not found' });
    }

    // Only creator or admin can delete
    if (requisition.user_id !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'You can only delete your own requisitions' });
    }

    // Delete document if exists
    if (requisition.document_path) {
      const filePath = path.join(__dirname, '../..', requisition.document_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.run('DELETE FROM requisitions WHERE id = ?', [req.params.id]);

    // Emit real-time update
    if (global.io) {
      global.io.emit('requisition_deleted', {
        requisition_id: req.params.id,
        user_id: req.user.id,
        deleted_by: req.user.name || 'User'
      });
      console.log('Emitted requisition_deleted event');
    }

    res.json({ message: 'Requisition deleted successfully' });
  } catch (error) {
    console.error('Delete requisition error:', error);
    res.status(500).json({ error: 'Failed to delete requisition: ' + error.message });
  }
});

module.exports = router;

