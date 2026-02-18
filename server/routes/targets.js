/**
 * Targets Management System - Production Ready
 * 
 * Features:
 * - Target creation, update, deletion (Admin only)
 * - Admin target aggregates all employee and department head targets
 * - Real-time progress tracking via target_progress entries
 * - Approval workflow for target progress entries
 * - Net amount calculation: total_progress (approved) + shared_in - shared_out
 * - Progress percentage and remaining amount calculations
 * - Fund sharing between employees/department heads
 * - Real-time Socket.IO updates
 * - Comprehensive error handling
 * - Everyone can see all targets, progress, and fund sharing history
 */

const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const { logAction } = require('../utils/audit');

/**
 * Helper function to calculate target metrics
 * @param {Object} target - Target object from database
 * @returns {Object} Calculated metrics
 */
async function calculateTargetMetrics(target) {
  const USE_POSTGRESQL = !!process.env.DATABASE_URL;
  
  try {
    // Check if target_progress table exists
    let targetProgressExists;
    if (USE_POSTGRESQL) {
      targetProgressExists = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'target_progress'"
      );
    } else {
      targetProgressExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='target_progress'");
    }

    // Calculate total_progress (only approved entries)
    let totalProgress = 0;
    if (targetProgressExists) {
      // Get all entries for debugging and manual calculation
      const allEntries = await db.all(
        `SELECT id, amount, status, 
                UPPER(TRIM(COALESCE(status, ''))) as normalized_status
         FROM target_progress
         WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)`,
        [target.id]
      );
      
      if (allEntries && allEntries.length > 0) {
        console.log(`[calculateTargetMetrics] Target ${target.id} - Found ${allEntries.length} progress entries:`, 
          allEntries.map(e => ({ id: e.id, amount: e.amount, status: e.status, normalized: e.normalized_status }))
        );
        
        // Manual calculation to verify SQL query
        let manualTotal = 0;
        let approvedCount = 0;
        for (const entry of allEntries) {
          const entryStatus = entry.status || '';
          const normalized = entry.normalized_status || '';
          const isApproved = entryStatus === 'Approved' || 
                           normalized === 'APPROVED' || 
                           !entryStatus || 
                           entryStatus.trim() === '';
          
          if (isApproved) {
            manualTotal += parseFloat(entry.amount || 0);
            approvedCount++;
          }
        }
        console.log(`[calculateTargetMetrics] Target ${target.id} - Manual calculation: approved=${approvedCount}, total=${manualTotal}`);
      }
      
      // Multiple query strategies to ensure we find approved entries
      // Strategy 1: Direct status match
      let query1 = await db.get(
        `SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total
         FROM target_progress
         WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)
           AND status = 'Approved'`,
        [target.id]
      );
      let result1 = parseFloat(query1?.total || 0) || 0;
      
      // Strategy 2: Normalized match
      let query2 = await db.get(
        `SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total
         FROM target_progress
         WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)
           AND UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED'`,
        [target.id]
      );
      let result2 = parseFloat(query2?.total || 0) || 0;
      
      // Strategy 3: NULL or empty status (treat as approved)
      let query3 = await db.get(
        `SELECT COALESCE(SUM(CAST(amount AS NUMERIC)), 0) as total
         FROM target_progress
         WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)
           AND (status IS NULL OR status = '' OR TRIM(status) = '')`,
        [target.id]
      );
      let result3 = parseFloat(query3?.total || 0) || 0;
      
      // Strategy 4: Combined CASE query
      const progressResult = await db.get(
        `SELECT COALESCE(SUM(CASE 
           WHEN status = 'Approved' THEN CAST(amount AS NUMERIC)
           WHEN UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' THEN CAST(amount AS NUMERIC)
           WHEN status IS NULL OR status = '' OR TRIM(status) = '' THEN CAST(amount AS NUMERIC)
           ELSE 0
         END), 0) as total,
         COUNT(CASE 
           WHEN status = 'Approved' OR UPPER(TRIM(COALESCE(status, ''))) = 'APPROVED' OR status IS NULL OR status = '' OR TRIM(status) = ''
           THEN 1
         END) as count
         FROM target_progress
         WHERE CAST(target_id AS INTEGER) = CAST(? AS INTEGER)`,
        [target.id]
      );
      
      totalProgress = parseFloat(progressResult?.total || 0) || 0;
      
      console.log(`[calculateTargetMetrics] Target ${target.id} - Query results:`, {
        direct_match: result1,
        normalized_match: result2,
        null_empty_match: result3,
        combined_query: totalProgress,
        approved_count: progressResult?.count || 0,
        using_value: totalProgress
      });
      
      // Use the highest result to ensure we don't miss anything
      totalProgress = Math.max(result1, result2, result3, totalProgress);
      
      // If no approved entries found but we have entries, log warning
      if (allEntries && allEntries.length > 0 && totalProgress === 0) {
        console.error(`[calculateTargetMetrics] ERROR: Target ${target.id} has ${allEntries.length} entries but total_progress is 0!`);
        console.error('Entry details:', JSON.stringify(allEntries, null, 2));
      }
    }

    // Check if fund_sharing table exists
    let fundSharingExists;
    if (USE_POSTGRESQL) {
      fundSharingExists = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fund_sharing'"
      );
    } else {
      fundSharingExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fund_sharing'");
    }

    // Calculate shared_out (funds shared from this target's user)
    let sharedOut = 0;
    if (fundSharingExists) {
      const sharedOutResult = await db.get(
        `SELECT COALESCE(SUM(CASE WHEN status = 'Active' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as total
         FROM fund_sharing
         WHERE from_user_id = ?`,
        [target.user_id]
      );
      sharedOut = parseFloat(sharedOutResult?.total || 0) || 0;
    }

    // Calculate shared_in (funds shared to this target's user)
    let sharedIn = 0;
    if (fundSharingExists) {
      const sharedInResult = await db.get(
        `SELECT COALESCE(SUM(CASE WHEN status = 'Active' THEN CAST(amount AS NUMERIC) ELSE 0 END), 0) as total
         FROM fund_sharing
         WHERE to_user_id = ?`,
        [target.user_id]
      );
      sharedIn = parseFloat(sharedInResult?.total || 0) || 0;
    }

    // Calculate net amount: total_progress + shared_in - shared_out
    const targetAmount = parseFloat(target.target_amount || 0) || 0;
    const netAmount = totalProgress + sharedIn - sharedOut;
    
    // Calculate progress percentage (can exceed 100%)
    const progressPercentage = targetAmount > 0 ? (netAmount / targetAmount) * 100 : 0;
    
    // Calculate remaining amount (cannot be negative)
    const remainingAmount = Math.max(0, targetAmount - netAmount);

    return {
      total_progress: totalProgress,
      shared_in: sharedIn,
      shared_out: sharedOut,
      net_amount: netAmount,
      progress_percentage: progressPercentage.toFixed(2),
      remaining_amount: remainingAmount
    };
  } catch (error) {
    console.error('Error calculating target metrics:', error);
    // Return zero values on error
    return {
      total_progress: 0,
      shared_in: 0,
      shared_out: 0,
      net_amount: 0,
      progress_percentage: '0.00',
      remaining_amount: parseFloat(target.target_amount || 0) || 0
    };
  }
}

/**
 * Helper function to update/create admin target
 * Aggregates all employee and department head targets (excluding admin's own target)
 */
async function updateAdminTarget(periodStart = null) {
  try {
    const adminUser = await db.get("SELECT id FROM users WHERE role = 'Admin' LIMIT 1");
    if (!adminUser) {
      return;
    }

    // Determine which period to update
    let periodToUse = periodStart;
    if (!periodToUse) {
      // Use the most recent period_start from active targets
      const latestPeriod = await db.get(
        "SELECT period_start FROM targets WHERE status = 'Active' ORDER BY period_start DESC LIMIT 1"
      );
      if (latestPeriod) {
        periodToUse = latestPeriod.period_start;
      } else {
        return; // No active targets to aggregate
      }
    }

    // Find or create admin target for this period
    let adminTarget = await db.get(
      'SELECT id FROM targets WHERE user_id = ? AND status = ? AND period_start = ?',
      [adminUser.id, 'Active', periodToUse]
    );

    // Aggregate all staff and department head targets (exclude admin)
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    
    // Check if target_progress and fund_sharing tables exist
    let targetProgressExists = false;
    let fundSharingExists = false;

    if (USE_POSTGRESQL) {
      const tpCheck = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'target_progress'"
      );
      targetProgressExists = !!tpCheck;
      
      const fsCheck = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fund_sharing'"
      );
      fundSharingExists = !!fsCheck;
    } else {
      const tpCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='target_progress'");
      targetProgressExists = !!tpCheck;
      
      const fsCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fund_sharing'");
      fundSharingExists = !!fsCheck;
    }

    // Aggregate target amounts, progress, and fund sharing from all staff/department heads
    const aggregationQuery = `
      SELECT 
        COALESCE(SUM(target_amount), 0) as total_target,
        COUNT(*) as target_count
      FROM targets
      WHERE user_id != ?
        AND status = ?
        AND period_start = ?
    `;

    const aggregation = await db.get(aggregationQuery, [adminUser.id, 'Active', periodToUse]);
    const totalTargetAmount = parseFloat(aggregation?.total_target || 0) || 0;

    // Calculate aggregated total_progress from all staff/department head targets
    let totalProgress = 0;
    if (targetProgressExists) {
      // First, get all progress entries for debugging
      const allProgressEntries = await db.all(
        `SELECT tp.id, tp.amount, tp.status, 
                UPPER(TRIM(COALESCE(tp.status, ''))) as normalized_status,
                t.id as target_id, t.user_id, t.period_start
         FROM target_progress tp
         JOIN targets t ON CAST(tp.target_id AS INTEGER) = CAST(t.id AS INTEGER)
         WHERE CAST(t.user_id AS INTEGER) != CAST(? AS INTEGER)
           AND t.status = ?`,
        [adminUser.id, 'Active']
      );
      
      console.log(`[updateAdminTarget] All progress entries for period ${periodToUse}:`, {
        total_entries: allProgressEntries?.length || 0,
        entries: allProgressEntries?.slice(0, 5) // Show first 5 for debugging
      });
      
      // Aggregate ALL approved entries from non-admin targets (ignore period filter for now to ensure we get everything)
      // The period filter can be added back later if needed, but for now let's aggregate everything
      const progressResult = await db.get(
        `SELECT COALESCE(SUM(CASE 
           WHEN tp.status = 'Approved' OR UPPER(TRIM(COALESCE(tp.status, ''))) = 'APPROVED' OR tp.status IS NULL OR tp.status = ''
           THEN COALESCE(CAST(tp.amount AS NUMERIC), 0)
           ELSE 0
         END), 0) as total,
         COUNT(CASE 
           WHEN tp.status = 'Approved' OR UPPER(TRIM(COALESCE(tp.status, ''))) = 'APPROVED' OR tp.status IS NULL OR tp.status = ''
           THEN 1
         END) as count
         FROM target_progress tp
         JOIN targets t ON CAST(tp.target_id AS INTEGER) = CAST(t.id AS INTEGER)
         WHERE CAST(t.user_id AS INTEGER) != CAST(? AS INTEGER)
           AND t.status = ?`,
        [adminUser.id, 'Active']
      );
      
      totalProgress = parseFloat(progressResult?.total || 0) || 0;
      
      console.log(`[updateAdminTarget] Aggregated total_progress (all periods):`, {
        total: totalProgress,
        count: progressResult?.count || 0,
        target_period: periodToUse,
        note: 'Aggregating all approved entries regardless of period'
      });
    }

    // IMPORTANT: Fund sharing should NOT affect admin target calculations
    // Admin target only reflects actual progress (approved entries), not fund transfers between staff
    // So we skip calculating shared_in and shared_out for admin target
    
    // Calculate admin net amount (ONLY from actual progress, NOT from fund sharing)
    const adminNetAmount = totalProgress; // Only use total_progress, exclude fund sharing
    const adminProgressPercentage = totalTargetAmount > 0 ? (adminNetAmount / totalTargetAmount) * 100 : 0;
    const adminRemainingAmount = Math.max(0, totalTargetAmount - adminNetAmount);
    
    console.log(`[updateAdminTarget] Admin target calculation (fund sharing excluded):`, {
      total_target_amount: totalTargetAmount,
      total_progress: totalProgress,
      admin_net_amount: adminNetAmount,
      admin_progress_percentage: adminProgressPercentage,
      admin_remaining_amount: adminRemainingAmount,
      note: 'Fund sharing between staff does NOT affect admin target'
    });

    if (adminTarget) {
      // Update existing admin target
      await db.run(
        `UPDATE targets 
         SET target_amount = ?, 
             notes = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          totalTargetAmount,
          `Auto-aggregated from ${aggregation?.target_count || 0} staff and department head targets for period ${periodToUse}`,
          adminTarget.id
        ]
      );
    } else {
      // Create new admin target
      const result = await db.run(
        `INSERT INTO targets (user_id, target_amount, category, period_start, period_end, notes, created_by, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminUser.id,
          totalTargetAmount,
          'Employee',
          periodToUse,
          null,
          `Auto-aggregated from ${aggregation?.target_count || 0} staff and department head targets`,
          adminUser.id,
          'Active'
        ]
      );
      adminTarget = { id: result.lastID || result.id || (result.rows && result.rows[0] && result.rows[0].id) };
    }

    // Emit real-time update for admin target
    if (global.io && adminTarget.id) {
      // Calculate admin metrics manually to exclude fund sharing
      // Admin target only reflects actual progress, not fund transfers
      const adminMetrics = {
        total_progress: totalProgress,
        shared_in: 0, // Fund sharing doesn't affect admin
        shared_out: 0, // Fund sharing doesn't affect admin
        net_amount: adminNetAmount, // Only from progress
        progress_percentage: adminProgressPercentage.toFixed(2),
        remaining_amount: adminRemainingAmount
      };

      global.io.emit('target_updated', {
        id: adminTarget.id,
        updated_by: 'System',
        reason: 'admin_target_aggregated',
        period: periodToUse,
        ...adminMetrics
      });

      global.io.emit('target_progress_updated', {
        target_id: adminTarget.id,
        action: 'admin_target_recalculated',
        ...adminMetrics
      });
    }

    return adminTarget.id;
  } catch (error) {
    console.error('Error updating admin target:', error);
    // Don't throw - this is a background operation
  }
}

/**
 * GET /api/targets
 * Get all targets - Everyone can see all targets
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    
    // Check if targets table exists
    let tableExists;
    if (USE_POSTGRESQL) {
      tableExists = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'targets'"
      );
    } else {
      tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='targets'");
    }

    if (!tableExists) {
      return res.json({ targets: [] });
    }

    // Build query - Everyone can see all targets
    let query = `
      SELECT t.*, 
             COALESCE(u.name, 'Unknown User') as user_name, 
             COALESCE(u.email, '') as user_email,
             COALESCE(u.role, '') as user_role,
             COALESCE(creator.name, 'System') as created_by_name
      FROM targets t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN users creator ON t.created_by = creator.id
      WHERE 1=1
    `;
    const params = [];

    // Filter by status if provided
    if (req.query.status) {
      query += ' AND t.status = ?';
      params.push(req.query.status);
    }

    // Filter by period if provided
    if (req.query.period_start) {
      query += ' AND t.period_start = ?';
      params.push(req.query.period_start);
    }

    query += ' ORDER BY t.created_at DESC';
    
    const targets = await db.all(query, params);

    // Calculate metrics for each target
    const targetsWithMetrics = await Promise.all(
      targets.map(async (target) => {
        const metrics = await calculateTargetMetrics(target);
        return {
          ...target,
          ...metrics,
          target_amount: parseFloat(target.target_amount || 0) || 0
        };
      })
    );

    // Ensure admin target exists if there are any staff/department head targets
    const adminUser = await db.get("SELECT id FROM users WHERE role = 'Admin' LIMIT 1");
    if (adminUser && targetsWithMetrics.length > 0) {
      // Check if admin target exists
      const hasStaffTargets = targetsWithMetrics.some(t => t.user_id !== adminUser.id && t.status === 'Active');
      if (hasStaffTargets) {
        // Trigger admin target update in background
        const latestPeriod = targetsWithMetrics
          .filter(t => t.user_id !== adminUser.id && t.status === 'Active')
          .sort((a, b) => new Date(b.period_start) - new Date(a.period_start))[0]?.period_start;
        if (latestPeriod) {
          updateAdminTarget(latestPeriod).catch(err => console.error('Error updating admin target on load:', err));
        }
      }
    }

    res.json({ targets: targetsWithMetrics });
  } catch (error) {
    console.error('Get targets error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch targets',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/targets/fund-sharing/history
 * Get fund sharing history - Everyone can see all sharing history
 * MUST be before /:id routes to avoid route conflicts
 */
router.get('/fund-sharing/history', authenticateToken, async (req, res) => {
  try {
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    
    // Check if fund_sharing table exists
    let tableExists;
    if (USE_POSTGRESQL) {
      tableExists = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fund_sharing'"
      );
    } else {
      tableExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fund_sharing'");
    }

    if (!tableExists) {
      return res.json({ history: [] });
    }

    // Everyone can see all sharing history - no filtering
    const query = `
      SELECT fs.*,
             sender.name as from_user_name,
             sender.email as from_user_email,
             recipient.name as to_user_name,
             recipient.email as to_user_email
      FROM fund_sharing fs
      LEFT JOIN users sender ON fs.from_user_id = sender.id
      LEFT JOIN users recipient ON fs.to_user_id = recipient.id
      ORDER BY fs.created_at DESC
    `;

    const history = await db.all(query);
    res.json({ history });
  } catch (error) {
    console.error('Get fund sharing history error:', error);
    res.status(500).json({ error: 'Failed to fetch fund sharing history' });
  }
});

/**
 * POST /api/targets/fund-sharing
 * Share funds between employees/department heads
 * User must have net_amount > share_amount
 * MUST be before /:id routes to avoid route conflicts
 */
router.post('/fund-sharing', authenticateToken, requireRole('Staff', 'DepartmentHead'), [
  body('to_user_id').isInt().withMessage('Valid recipient user ID is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Valid amount greater than 0 is required'),
  body('reason').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { to_user_id, amount, reason } = req.body;
    const from_user_id = req.user.id;

    // Cannot share to oneself
    if (from_user_id === to_user_id) {
      return res.status(400).json({ error: 'Cannot share funds to yourself' });
    }

    // Verify recipient exists and is Staff or DepartmentHead
    const recipient = await db.get(
      'SELECT id, name, email, role FROM users WHERE id = ? AND role IN (?, ?)',
      [to_user_id, 'Staff', 'DepartmentHead']
    );
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found or invalid role' });
    }

    // Get sender's active target
    const senderTarget = await db.get(
      'SELECT * FROM targets WHERE user_id = ? AND status = ?',
      [from_user_id, 'Active']
    );

    if (!senderTarget) {
      return res.status(400).json({ error: 'You do not have an active target' });
    }

    // Calculate sender's current metrics
    const senderMetrics = await calculateTargetMetrics(senderTarget);
    const availableAmount = senderMetrics.net_amount - parseFloat(amount);

    // Validate: user must have more than what they want to share
    if (senderMetrics.net_amount <= parseFloat(amount)) {
      return res.status(400).json({ 
        error: `Insufficient funds. Your net amount is ${senderMetrics.net_amount.toFixed(2)}, but you are trying to share ${parseFloat(amount).toFixed(2)}. You must have more funds than the share amount.`
      });
    }

    // Get fund_sharing table existence
    const USE_POSTGRESQL = !!process.env.DATABASE_URL;
    let fundSharingExists;
    if (USE_POSTGRESQL) {
      fundSharingExists = await db.get(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'fund_sharing'"
      );
    } else {
      fundSharingExists = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='fund_sharing'");
    }

    if (!fundSharingExists) {
      return res.status(500).json({ error: 'Fund sharing table does not exist' });
    }

    // Create fund sharing record
    const result = await db.run(
      `INSERT INTO fund_sharing (from_user_id, to_user_id, amount, reason, status, created_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [from_user_id, to_user_id, parseFloat(amount), reason || null, 'Active', req.user.id]
    );

    const sharingId = result.lastID || result.id || (result.rows && result.rows[0] && result.rows[0].id);

    await logAction(req.user.id, 'share_funds', 'fund_sharing', sharingId, { to_user_id, amount, reason }, req);

    // Get updated metrics for both sender and recipient
    const updatedSenderTarget = await db.get('SELECT * FROM targets WHERE id = ?', [senderTarget.id]);
    const senderUpdatedMetrics = await calculateTargetMetrics(updatedSenderTarget);

    const recipientTarget = await db.get(
      'SELECT * FROM targets WHERE user_id = ? AND status = ?',
      [to_user_id, 'Active']
    );

    let recipientMetrics = null;
    if (recipientTarget) {
      const updatedRecipientTarget = await db.get('SELECT * FROM targets WHERE id = ?', [recipientTarget.id]);
      recipientMetrics = await calculateTargetMetrics(updatedRecipientTarget);
    }

    // IMPORTANT: Do NOT update admin target when funds are shared
    // Fund sharing between staff should NOT affect admin target calculations
    // Admin target only reflects actual progress (approved entries), not fund transfers
    // So we skip updating admin target here
    console.log('[Fund Sharing] Skipping admin target update - fund sharing does not affect admin target');

    // Emit real-time updates
    if (global.io) {
      global.io.emit('fund_shared', {
        id: sharingId,
        from_user_id,
        from_user_name: req.user.name,
        to_user_id,
        to_user_name: recipient.name,
        amount: parseFloat(amount),
        reason
      });

      global.io.emit('target_progress_updated', {
        target_id: senderTarget.id,
        user_id: from_user_id,
        action: 'fund_shared_out',
        ...senderUpdatedMetrics
      });

      if (recipientTarget && recipientMetrics) {
        global.io.emit('target_progress_updated', {
          target_id: recipientTarget.id,
          user_id: to_user_id,
          action: 'fund_shared_in',
          ...recipientMetrics
        });
      }
    }

    res.status(201).json({
      message: 'Funds shared successfully',
      sharing: {
        id: sharingId,
        from_user_id,
        to_user_id,
        amount: parseFloat(amount),
        reason
      },
      sender_target: {
        id: senderTarget.id,
        ...senderUpdatedMetrics
      },
      recipient_target: recipientTarget && recipientMetrics ? {
        id: recipientTarget.id,
        ...recipientMetrics
      } : null
    });
  } catch (error) {
    console.error('Share funds error:', error);
    res.status(500).json({ 
      error: 'Failed to share funds',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/targets/progress/:id/approve
 * Approve or reject target progress entry (Admin only)
 * Updates admin target when progress is approved
 * MUST be before /:id/progress route to avoid conflicts
 */
router.put('/progress/:id/approve', authenticateToken, requireRole('Admin'), [
  body('status').isIn(['Approved', 'Rejected']).withMessage('Status must be Approved or Rejected')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { status } = req.body;
    
    // Get progress entry
    const progressEntry = await db.get(
      `SELECT tp.*, t.user_id as target_user_id, t.period_start
       FROM target_progress tp
       JOIN targets t ON tp.target_id = t.id
       WHERE tp.id = ?`,
      [req.params.id]
    );

    if (!progressEntry) {
      return res.status(404).json({ error: 'Progress entry not found' });
    }

    // Update status - normalize to 'Approved' or 'Rejected'
    const normalizedStatus = status === 'Approved' ? 'Approved' : 'Rejected';
    
    try {
      await db.run(
        'UPDATE target_progress SET status = ? WHERE id = ?',
        [normalizedStatus, req.params.id]
      );
    } catch (updateError) {
      // If column doesn't exist, try without updated_at
      if (updateError.message && updateError.message.includes('updated_at')) {
        await db.run(
          'UPDATE target_progress SET status = ? WHERE id = ?',
          [normalizedStatus, req.params.id]
        );
      } else {
        throw updateError;
      }
    }

    // Wait a moment for database commit (especially for PostgreSQL)
    await new Promise(resolve => setTimeout(resolve, 200));

    // Verify the update was successful
    const verifyProgress = await db.get(
      'SELECT status, amount FROM target_progress WHERE id = ?',
      [req.params.id]
    );
    
    if (!verifyProgress) {
      return res.status(404).json({ error: 'Progress entry not found after update' });
    }
    
    console.log('Progress entry updated:', {
      id: req.params.id,
      status: verifyProgress.status,
      amount: verifyProgress.amount,
      expected_status: normalizedStatus
    });

    await logAction(req.user.id, 'approve_target_progress', 'target_progress', req.params.id, { status: normalizedStatus }, req);

    // Get updated target with metrics
    const target = await db.get('SELECT * FROM targets WHERE id = ?', [progressEntry.target_id]);
    if (!target) {
      return res.status(404).json({ error: 'Target not found after progress update' });
    }
    
    // Verify approved entries are being counted correctly
    const debugQuery = await db.all(
      `SELECT id, amount, status, 
              UPPER(TRIM(COALESCE(status, ''))) as normalized_status
       FROM target_progress
       WHERE target_id = ?
       ORDER BY id`,
      [target.id]
    );
    console.log('All target_progress entries for target', target.id, ':', debugQuery);
    
    // Directly query to verify what's actually in the database
    const allProgressEntries = await db.all(
      `SELECT id, amount, status, 
              UPPER(TRIM(COALESCE(status, ''))) as normalized_status
       FROM target_progress
       WHERE target_id = ?
       ORDER BY id`,
      [target.id]
    );
    console.log('ALL progress entries for target', target.id, ':', JSON.stringify(allProgressEntries, null, 2));
    
    const approvedSum = await db.get(
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
       WHERE target_id = ?`,
      [target.id]
    );
    console.log('Approved entries sum for target', target.id, ':', approvedSum);
    
    // Also try a manual calculation to verify
    let manualSum = 0;
    let manualCount = 0;
    if (allProgressEntries) {
      for (const entry of allProgressEntries) {
        const entryStatus = entry.status || '';
        const normalizedStatus = entry.normalized_status || '';
        if (entryStatus === 'Approved' || normalizedStatus === 'APPROVED' || !entryStatus) {
          manualSum += parseFloat(entry.amount || 0);
          manualCount++;
        }
      }
    }
    console.log('Manual calculation for target', target.id, ':', { total: manualSum, count: manualCount });
    
    let metrics;
    try {
      metrics = await calculateTargetMetrics(target);
      console.log('Calculated metrics for target', target.id, ':', metrics);
    } catch (metricsError) {
      console.error('Error calculating target metrics:', metricsError);
      console.error('Error stack:', metricsError.stack);
      // Return basic response even if metrics calculation fails
      metrics = {
        total_progress: 0,
        shared_in: 0,
        shared_out: 0,
        net_amount: 0,
        progress_percentage: '0.00',
        remaining_amount: parseFloat(target.target_amount || 0) || 0
      };
    }

    // Update admin target if this isn't admin's own target (async, non-blocking)
    const adminUser = await db.get("SELECT id FROM users WHERE role = 'Admin' LIMIT 1");
    if (adminUser && progressEntry.target_user_id !== adminUser.id && progressEntry.period_start) {
      // Run in background, don't wait for it
      setImmediate(() => {
        updateAdminTarget(progressEntry.period_start).catch(err => 
          console.error('Error updating admin target (non-blocking):', err.message || err)
        );
      });
    }

    // Emit real-time updates
    try {
      if (global.io) {
        global.io.emit('target_progress_updated', {
          target_id: progressEntry.target_id,
          user_id: progressEntry.target_user_id,
          progress_id: req.params.id,
          action: status === 'Approved' ? 'progress_approved' : 'progress_rejected',
          status,
          ...metrics
        });

        global.io.emit('target_updated', {
          id: progressEntry.target_id,
          updated_by: req.user.name,
          reason: 'target_progress_' + status.toLowerCase(),
          ...metrics
        });
      }
    } catch (emitError) {
      console.error('Error emitting socket events:', emitError);
      // Don't fail the request if socket emit fails
    }

    res.json({
      message: `Target progress entry ${status.toLowerCase()} successfully`,
      progress_id: req.params.id,
      target: {
        id: progressEntry.target_id,
        ...metrics
      }
    });
  } catch (error) {
    console.error('Approve target progress error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Failed to approve target progress entry',
      message: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * GET /api/targets/:id/progress
 * Get target progress history - Everyone can view all progress
 */
router.get('/:id/progress', authenticateToken, async (req, res) => {
  try {
    const target = await db.get('SELECT * FROM targets WHERE id = ?', [req.params.id]);
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }

    // Everyone can view all progress - no authorization check

    const progressEntries = await db.all(
      `SELECT tp.*, 
              pr.name as progress_report_name,
              pr.date as progress_report_date
       FROM target_progress tp
       LEFT JOIN progress_reports pr ON tp.progress_report_id = pr.id
       WHERE tp.target_id = ?
       ORDER BY tp.transaction_date DESC, tp.created_at DESC`,
      [req.params.id]
    );

    res.json({ progress: progressEntries });
  } catch (error) {
    console.error('Get target progress error:', error);
    res.status(500).json({ error: 'Failed to fetch target progress' });
  }
});

/**
 * GET /api/targets/:id
 * Get single target by ID - Everyone can view all targets
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const target = await db.get(
      `SELECT t.*, 
              COALESCE(u.name, 'Unknown User') as user_name,
              COALESCE(u.email, '') as user_email,
              COALESCE(u.role, '') as user_role,
              COALESCE(creator.name, 'System') as created_by_name
       FROM targets t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN users creator ON t.created_by = creator.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }

    // Everyone can view all targets - no authorization check

    // Calculate metrics
    const metrics = await calculateTargetMetrics(target);

    res.json({
      target: {
        ...target,
        ...metrics,
        target_amount: parseFloat(target.target_amount || 0) || 0
      }
    });
  } catch (error) {
    console.error('Get target error:', error);
    res.status(500).json({ error: 'Failed to fetch target' });
  }
});

/**
 * POST /api/targets
 * Create new target (Admin only)
 * Auto-creates/updates admin target
 */
router.post('/', authenticateToken, requireRole('Admin'), [
  body('user_id').isInt().withMessage('Valid user ID is required'),
  body('target_amount').isFloat({ min: 0 }).withMessage('Valid target amount is required'),
  body('category').optional().isIn(['Employee', 'Client for Consultancy', 'Client for Audit', 'Student', 'Others']),
  body('period_start').isISO8601().withMessage('Valid start date is required'),
  body('period_end').optional().isISO8601()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, target_amount, category, period_start, period_end, notes } = req.body;

    // Verify user exists
    const user = await db.get('SELECT id, name, email, role FROM users WHERE id = ?', [user_id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Don't allow creating target for admin (admin target is auto-generated)
    if (user.role === 'Admin') {
      return res.status(400).json({ error: 'Admin targets are automatically generated from staff and department head targets' });
    }

    // Only allow creating targets for Staff and DepartmentHead (exclude Client, Partner, etc.)
    if (user.role !== 'Staff' && user.role !== 'DepartmentHead') {
      return res.status(400).json({ 
        error: `Targets can only be created for Staff and DepartmentHead. ${user.role} role is not allowed.` 
      });
    }

    // Check if user already has an active target
    const existingTarget = await db.get(
      'SELECT id FROM targets WHERE user_id = ? AND status = ?',
      [user_id, 'Active']
    );

    if (existingTarget) {
      return res.status(400).json({ 
        error: 'User already has an active target. Please extend or cancel the existing target first.',
        existing_target_id: existingTarget.id
      });
    }

    // Create target
    const result = await db.run(
      `INSERT INTO targets (user_id, target_amount, category, period_start, period_end, notes, created_by, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [user_id, target_amount, category || null, period_start, period_end || null, notes || null, req.user.id, 'Active']
    );

    const targetId = result.lastID || result.id || (result.rows && result.rows[0] && result.rows[0].id);
    
    if (!targetId) {
      return res.status(500).json({ error: 'Failed to create target - could not retrieve target ID' });
    }

    await logAction(req.user.id, 'create_target', 'targets', targetId, { user_id, target_amount, category }, req);

    // Update admin target in background
    updateAdminTarget(period_start).catch(err => console.error('Error updating admin target:', err));

    // Get created target with metrics
    const createdTarget = await db.get(
      `SELECT t.*, 
              COALESCE(u.name, 'Unknown User') as user_name,
              COALESCE(u.email, '') as user_email
       FROM targets t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = ?`,
      [targetId]
    );

    const metrics = await calculateTargetMetrics(createdTarget);

    // Emit real-time update
    if (global.io) {
      global.io.emit('target_created', {
        id: targetId,
        user_id,
        user_name: user.name,
        target_amount,
        created_by: req.user.name
      });
    }

    res.status(201).json({
      message: 'Target created successfully',
      target: {
        ...createdTarget,
        ...metrics
      }
    });
  } catch (error) {
    console.error('Create target error:', error);
    res.status(500).json({ 
      error: 'Failed to create target',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * PUT /api/targets/:id
 * Update target (Admin only)
 * Updates admin target if this target changed
 */
router.put('/:id', authenticateToken, requireRole('Admin'), [
  body('target_amount').optional().isFloat({ min: 0 }),
  body('category').optional().isIn(['Employee', 'Client for Consultancy', 'Client for Audit', 'Student', 'Others']),
  body('status').optional().isIn(['Active', 'Completed', 'Extended', 'Cancelled']),
  body('period_start').optional().isISO8601(),
  body('period_end').optional().isISO8601(),
  body('manual_net_amount_override').optional().isFloat({ min: 0 })
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const target = await db.get('SELECT * FROM targets WHERE id = ?', [req.params.id]);
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }

    const updates = [];
    const params = [];

    if (req.body.target_amount !== undefined) {
      updates.push('target_amount = ?');
      params.push(req.body.target_amount);
    }
    if (req.body.category !== undefined) {
      updates.push('category = ?');
      params.push(req.body.category);
    }
    if (req.body.status !== undefined) {
      updates.push('status = ?');
      params.push(req.body.status);
    }
    if (req.body.period_start !== undefined) {
      updates.push('period_start = ?');
      params.push(req.body.period_start);
    }
    if (req.body.period_end !== undefined) {
      updates.push('period_end = ?');
      params.push(req.body.period_end);
    }
    if (req.body.notes !== undefined) {
      updates.push('notes = ?');
      params.push(req.body.notes);
    }

    // Handle manual net_amount override (Admin only)
    let manualNetAmount = null;
    if (req.body.manual_net_amount_override !== undefined && req.body.manual_net_amount_override !== null) {
      manualNetAmount = parseFloat(req.body.manual_net_amount_override);
      console.log('Manual net_amount override requested:', manualNetAmount);
    }

    if (updates.length === 0 && !manualNetAmount) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      params.push(req.params.id);
      await db.run(`UPDATE targets SET ${updates.join(', ')} WHERE id = ?`, params);
    }
    
    await logAction(req.user.id, 'update_target', 'targets', req.params.id, req.body, req);

    // Get current target state (after update if any)
    const updatedTarget = await db.get(
      `SELECT t.*, 
              COALESCE(u.name, 'Unknown User') as user_name,
              COALESCE(u.email, '') as user_email
       FROM targets t
       LEFT JOIN users u ON t.user_id = u.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    // Calculate current metrics
    let metrics = await calculateTargetMetrics(updatedTarget);

    // If manual net_amount override is provided, adjust total_progress to achieve it
    if (manualNetAmount !== null) {
      // net_amount = total_progress + shared_in - shared_out
      // So: total_progress = net_amount - shared_in + shared_out
      const requiredTotalProgress = manualNetAmount - metrics.shared_in + metrics.shared_out;
      const currentTotalProgress = metrics.total_progress;
      const adjustmentNeeded = requiredTotalProgress - currentTotalProgress;

      console.log('Manual net_amount adjustment:', {
        requested_net_amount: manualNetAmount,
        current_net_amount: metrics.net_amount,
        current_total_progress: currentTotalProgress,
        current_shared_in: metrics.shared_in,
        current_shared_out: metrics.shared_out,
        required_total_progress: requiredTotalProgress,
        adjustment_needed: adjustmentNeeded
      });

      // Create a manual adjustment entry in target_progress
      if (Math.abs(adjustmentNeeded) > 0.01) { // Only if adjustment is significant
        const USE_POSTGRESQL = !!process.env.DATABASE_URL;
        
        // Check if target_progress table exists
        let targetProgressExists = false;
        if (USE_POSTGRESQL) {
          const tpCheck = await db.get(
            "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'target_progress'"
          );
          targetProgressExists = !!tpCheck;
        } else {
          const tpCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='target_progress'");
          targetProgressExists = !!tpCheck;
        }

        if (targetProgressExists) {
          // Create manual adjustment entry
          await db.run(
            `INSERT INTO target_progress (target_id, user_id, amount, category, status, transaction_date, notes)
             VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
            [
              updatedTarget.id,
              updatedTarget.user_id,
              adjustmentNeeded,
              'Manual Adjustment',
              'Approved',
              `Manual net_amount override by ${req.user.name || 'Admin'}: Set to ${manualNetAmount}`
            ]
          );

          console.log('Created manual adjustment entry:', {
            target_id: updatedTarget.id,
            adjustment_amount: adjustmentNeeded,
            new_net_amount: manualNetAmount
          });

          // Wait for database commit
          await new Promise(resolve => setTimeout(resolve, 300));

          // Verify the entry was created
          const verifyAdjustment = await db.get(
            'SELECT id, amount, status FROM target_progress WHERE target_id = ? AND category = ? ORDER BY id DESC LIMIT 1',
            [updatedTarget.id, 'Manual Adjustment']
          );
          console.log('Verified manual adjustment entry:', verifyAdjustment);
        }
      }

      // Recalculate metrics with the manual adjustment (after commit)
      metrics = await calculateTargetMetrics(updatedTarget);
      
      console.log('Metrics after manual override:', {
        total_progress: metrics.total_progress,
        net_amount: metrics.net_amount,
        expected_net_amount: manualNetAmount
      });
    }

    // Update admin target if this target changed (only if not admin's own target)
    const adminUser = await db.get("SELECT id FROM users WHERE role = 'Admin' LIMIT 1");
    if (adminUser && target.user_id !== adminUser.id) {
      updateAdminTarget(target.period_start || req.body.period_start).catch(err => 
        console.error('Error updating admin target:', err)
      );
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('target_updated', {
        id: req.params.id,
        updated_by: req.user.name,
        ...metrics
      });
    }

    res.json({
      message: 'Target updated successfully',
      target: {
        ...updatedTarget,
        ...metrics
      }
    });
  } catch (error) {
    console.error('Update target error:', error);
    res.status(500).json({ error: 'Failed to update target' });
  }
});

/**
 * DELETE /api/targets/:id
 * Delete target (Admin only)
 * Updates admin target after deletion
 */
router.delete('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const target = await db.get('SELECT * FROM targets WHERE id = ?', [req.params.id]);
    if (!target) {
      return res.status(404).json({ error: 'Target not found' });
    }

    const periodStart = target.period_start;
    const userId = target.user_id;

    await db.run('DELETE FROM targets WHERE id = ?', [req.params.id]);
    await logAction(req.user.id, 'delete_target', 'targets', req.params.id, {}, req);

    // Update admin target if this wasn't admin's own target
    const adminUser = await db.get("SELECT id FROM users WHERE role = 'Admin' LIMIT 1");
    if (adminUser && userId !== adminUser.id) {
      updateAdminTarget(periodStart).catch(err => 
        console.error('Error updating admin target:', err)
      );
    }

    // Emit real-time update
    if (global.io) {
      global.io.emit('target_deleted', {
        id: req.params.id,
        deleted_by: req.user.name
      });
    }

    res.json({ message: 'Target deleted successfully' });
  } catch (error) {
    console.error('Delete target error:', error);
    res.status(500).json({ error: 'Failed to delete target' });
  }
});

// Export helper functions for use in other modules
module.exports = router;
module.exports.calculateTargetMetrics = calculateTargetMetrics;
module.exports.updateAdminTarget = updateAdminTarget;
