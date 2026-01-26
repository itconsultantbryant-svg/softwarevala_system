const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const { sendNotificationToUser, sendNotificationToRole } = require('../utils/notifications');

// Get all attendance records
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        sa.*,
        u.name as user_name,
        u.email as user_email,
        approver.name as approver_name
      FROM staff_attendance sa
      LEFT JOIN users u ON sa.user_id = u.id
      LEFT JOIN users approver ON sa.approved_by = approver.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Non-admin users only see their own attendance
    if (req.user.role !== 'Admin') {
      query += ' AND sa.user_id = ?';
      params.push(req.user.id);
    }
    
    query += ' ORDER BY sa.attendance_date DESC, sa.created_at DESC';
    
    const attendance = await db.all(query, params);
    res.json({ attendance });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({ error: 'Failed to fetch attendance: ' + error.message });
  }
});

// Sign in (Staff + Admin)
router.post('/sign-in', authenticateToken, requireRole(['Staff', 'Admin']), async (req, res) => {
  try {
    const { late_reason } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const nowISO = now.toISOString();
    
    const existing = await db.get(
      'SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    
    if (existing && existing.sign_in_time) {
      return res.status(400).json({ error: 'You have already signed in today' });
    }
    
    const standardStartTime = new Date(now);
    standardStartTime.setHours(9, 0, 0, 0);
    
    const isLate = now > standardStartTime;
    
    if (isLate && !late_reason) {
      return res.status(400).json({ error: 'Please provide a reason for signing in late' });
    }
    
    const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const userName = user?.name || req.user.email;
    
    const status = 'Pending';
    
    if (existing) {
      await db.run(`
        UPDATE staff_attendance SET
          sign_in_time = ?,
          sign_in_late = ?,
          sign_in_late_reason = ?,
          status = ?,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [nowISO, isLate ? 1 : 0, isLate ? late_reason : null, status, existing.id]);
    } else {
      await db.run(`
        INSERT INTO staff_attendance (
          user_id, user_name, attendance_date, sign_in_time,
          sign_in_late, sign_in_late_reason, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        req.user.id,
        userName,
        today,
        nowISO,
        isLate ? 1 : 0,
        isLate ? late_reason : null,
        status
      ]);
    }
    
    await sendNotificationToRole('Admin', {
      title: 'Staff Sign-In',
      message: `${userName} has signed in${isLate ? ' (Late)' : ''}`,
      link: '/attendance',
      type: isLate ? 'warning' : 'info',
      senderId: req.user.id
    });
    
    res.json({ message: 'Signed in successfully. Awaiting admin approval.' });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'Failed to sign in: ' + error.message });
  }
});

// Sign out (Staff + Admin)
router.post('/sign-out', authenticateToken, requireRole(['Staff', 'Admin']), async (req, res) => {
  try {
    const { early_reason } = req.body;
    const today = new Date().toISOString().split('T')[0];
    const now = new Date();
    const nowISO = now.toISOString();
    
    const attendance = await db.get(
      'SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    
    if (!attendance || !attendance.sign_in_time) {
      return res.status(400).json({ error: 'You must sign in before signing out' });
    }
    
    if (attendance.sign_out_time) {
      return res.status(400).json({ error: 'You have already signed out today' });
    }
    
    const standardEndTime = new Date(now);
    standardEndTime.setHours(17, 0, 0, 0);
    
    const isEarly = now < standardEndTime;
    
    if (isEarly && !early_reason) {
      return res.status(400).json({ error: 'Please provide a reason for signing out early' });
    }
    
    await db.run(`
      UPDATE staff_attendance SET
        sign_out_time = ?,
        sign_out_early = ?,
        sign_out_early_reason = ?,
        status = 'Pending',
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [nowISO, isEarly ? 1 : 0, isEarly ? early_reason : null, attendance.id]);
    
    await sendNotificationToRole('Admin', {
      title: 'Staff Sign-Out',
      message: `Staff signed out${isEarly ? ' early' : ''}`,
      link: '/attendance',
      type: isEarly ? 'warning' : 'info',
      senderId: req.user.id
    });
    
    res.json({ message: 'Signed out successfully. Awaiting admin approval.' });
  } catch (error) {
    console.error('Sign out error:', error);
    res.status(500).json({ error: 'Failed to sign out: ' + error.message });
  }
});

// Today status (Staff + Admin)
router.get('/today/status', authenticateToken, requireRole(['Staff', 'Admin']), async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const attendance = await db.get(
      'SELECT * FROM staff_attendance WHERE user_id = ? AND attendance_date = ?',
      [req.user.id, today]
    );
    
    res.json({
      attendance: attendance || null,
      canSignIn: !attendance || !attendance.sign_in_time,
      canSignOut: attendance && attendance.sign_in_time && !attendance.sign_out_time
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Approve / Reject (Admin only)
router.put('/:id/approve', authenticateToken, requireRole(['Admin']), async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    await db.run(`
      UPDATE staff_attendance SET
        status = ?,
        approved_by = ?,
        approved_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, req.user.id, req.params.id]);
    
    res.json({ message: `Attendance ${status}` });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
