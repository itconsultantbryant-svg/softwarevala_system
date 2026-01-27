// server/routes/staffAttendance.js
// Centralized Staff Attendance Routes (STABLE & FIXED)

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const { formatISO } = require('date-fns');

// Helper: get today date (YYYY-MM-DD)
const getTodayDate = () =>
  formatISO(new Date(), { representation: 'date' });

/* ============================
   GET: User attendance history
============================ */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT *
       FROM staff_attendance
       WHERE user_id = ?
       ORDER BY attendance_date DESC`,
      [req.user.id]
    );
    res.json({ attendance: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

/* ============================
   GET: Today status
============================ */
router.get('/today/status', authenticateToken, async (req, res) => {
  try {
    const today = getTodayDate();

    const attendance = await db.get(
      `SELECT *
       FROM staff_attendance
       WHERE user_id = ? AND attendance_date = ?`,
      [req.user.id, today]
    );

    res.json({
      attendance,
      canSignIn: !attendance || !attendance.sign_in_time,
      canSignOut:
        attendance &&
        attendance.sign_in_time &&
        !attendance.sign_out_time
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch today status' });
  }
});

/* ============================
   POST: Sign In (FIXED)
============================ */
router.post('/sign-in', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userName =
      req.user.name || req.user.email || 'Staff';

    const today = getTodayDate();
    const now = new Date();

    const standardStart = new Date();
    standardStart.setHours(9, 0, 0, 0);
    const isLate = now > standardStart;

    const existing = await db.get(
      `SELECT *
       FROM staff_attendance
       WHERE user_id = ? AND attendance_date = ?`,
      [userId, today]
    );

    if (existing && existing.sign_in_time) {
      return res
        .status(400)
        .json({ error: 'Already signed in today' });
    }

    if (!existing) {
      // INSERT new attendance
      await db.run(
        `INSERT INTO staff_attendance
        (user_id, user_name, attendance_date,
         sign_in_time, sign_in_late, sign_in_late_reason, status)
         VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
        [
          userId,
          userName,
          today,
          now.toISOString(),
          isLate ? 1 : 0,
          isLate ? req.body.late_reason || null : null
        ]
      );
    } else {
      // UPDATE existing attendance
      await db.run(
        `UPDATE staff_attendance
         SET sign_in_time = ?,
             sign_in_late = ?,
             sign_in_late_reason = ?,
             status = 'Pending',
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          now.toISOString(),
          isLate ? 1 : 0,
          isLate ? req.body.late_reason || null : null,
          existing.id
        ]
      );
    }

    res.json({ message: 'Signed in successfully' });
  } catch (err) {
    console.error('SIGN-IN ERROR:', err);
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

/* ============================
   POST: Sign Out
============================ */
router.post('/sign-out', authenticateToken, async (req, res) => {
  try {
    const today = getTodayDate();
    const now = new Date();

    const standardEnd = new Date();
    standardEnd.setHours(17, 0, 0, 0);
    const isEarly = now < standardEnd;

    const attendance = await db.get(
      `SELECT *
       FROM staff_attendance
       WHERE user_id = ? AND attendance_date = ?`,
      [req.user.id, today]
    );

    if (!attendance || !attendance.sign_in_time) {
      return res
        .status(400)
        .json({ error: 'You must sign in first' });
    }

    if (attendance.sign_out_time) {
      return res
        .status(400)
        .json({ error: 'Already signed out today' });
    }

    await db.run(
      `UPDATE staff_attendance
       SET sign_out_time = ?,
           sign_out_early = ?,
           sign_out_early_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        now.toISOString(),
        isEarly ? 1 : 0,
        isEarly ? req.body.early_reason || null : null,
        attendance.id
      ]
    );

    res.json({ message: 'Signed out successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to sign out' });
  }
});

/* ============================
   PUT: Approve / Reject
============================ */
router.put(
  '/:id/approve',
  authenticateToken,
  requireRole('Admin'),
  async (req, res) => {
    try {
      const { status, admin_notes } = req.body;

      if (!['Approved', 'Rejected'].includes(status)) {
        return res
          .status(400)
          .json({ error: 'Invalid status' });
      }

      await db.run(
        `UPDATE staff_attendance
         SET status = ?,
             approved_by = ?,
             approved_at = CURRENT_TIMESTAMP,
             admin_notes = ?
         WHERE id = ?`,
        [
          status,
          req.user.id,
          admin_notes || null,
          req.params.id
        ]
      );

      res.json({
        message: `Attendance ${status.toLowerCase()}`
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Approval failed' });
    }
  }
);

/* ============================
   GET: Admin View
============================ */
router.get(
  '/admin/view',
  authenticateToken,
  requireRole('Admin'),
  async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT sa.*, u.email AS user_email
         FROM staff_attendance sa
         JOIN users u ON u.id = sa.user_id
         ORDER BY sa.user_id, sa.attendance_date`
      );

      res.json({ attendance: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Failed to load admin view' });
    }
  }
);

/* ============================
   GET: Calendar View
============================ */
router.get('/calendar', authenticateToken, async (req, res) => {
  try {
    const { month, year } = req.query;

    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = new Date(year, month, 0)
      .toISOString()
      .split('T')[0];

    const rows = await db.all(
      `SELECT attendance_date, status,
              sign_in_late, sign_out_early
       FROM staff_attendance
       WHERE user_id = ?
       AND attendance_date BETWEEN ? AND ?`,
      [req.user.id, start, end]
    );

    res.json({ records: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to load calendar' });
  }
});

module.exports = router;
