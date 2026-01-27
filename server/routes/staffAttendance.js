// server/routes/staffAttendance.js

const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const { formatISO, startOfWeek, endOfWeek } = require('date-fns');

// ============================
// Helpers
// ============================
const todayDate = () =>
  formatISO(new Date(), { representation: 'date' });

// ============================
// STAFF: Attendance History
// ============================
router.get('/', authenticateToken, async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM staff_attendance
       WHERE user_id = ?
       ORDER BY attendance_date DESC`,
      [req.user.id]
    );

    res.json({ attendance: rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch attendance' });
  }
});

// ============================
// STAFF: Today Status
// ============================
router.get('/today/status', authenticateToken, async (req, res) => {
  try {
    const today = todayDate();

    const attendance = await db.get(
      `SELECT * FROM staff_attendance
       WHERE user_id = ? AND attendance_date = ?`,
      [req.user.id, today]
    );

    res.json({
      attendance,
      canSignIn: !attendance?.sign_in_time,
      canSignOut:
        attendance?.sign_in_time && !attendance?.sign_out_time
    });
  } catch {
    res.status(500).json({ error: 'Status check failed' });
  }
});

// ============================
// STAFF: Sign In
// ============================
router.post('/sign-in', authenticateToken, async (req, res) => {
  try {
    const today = todayDate();
    const now = new Date();

    const start = new Date();
    start.setHours(9, 0, 0, 0);
    const late = now > start;

    const existing = await db.get(
      `SELECT * FROM staff_attendance
       WHERE user_id = ? AND attendance_date = ?`,
      [req.user.id, today]
    );

    if (existing?.sign_in_time) {
      return res.status(400).json({ error: 'Already signed in' });
    }

    await db.run(
      `INSERT INTO staff_attendance (
        user_id, user_name, attendance_date,
        sign_in_time, sign_in_late, sign_in_late_reason, status
      ) VALUES (?, ?, ?, ?, ?, ?, 'Pending')`,
      [
        req.user.id,
        req.user.name,
        today,
        now.toISOString(),
        late ? 1 : 0,
        late ? req.body?.late_reason || null : null
      ]
    );

    res.json({ message: 'Sign-in successful' });
  } catch {
    res.status(500).json({ error: 'Failed to sign in' });
  }
});

// ============================
// STAFF: Sign Out
// ============================
router.post('/sign-out', authenticateToken, async (req, res) => {
  try {
    const today = todayDate();
    const now = new Date();

    const end = new Date();
    end.setHours(17, 0, 0, 0);
    const early = now < end;

    const record = await db.get(
      `SELECT * FROM staff_attendance
       WHERE user_id = ? AND attendance_date = ?`,
      [req.user.id, today]
    );

    if (!record?.sign_in_time)
      return res.status(400).json({ error: 'Sign in first' });

    if (record.sign_out_time)
      return res.status(400).json({ error: 'Already signed out' });

    await db.run(
      `UPDATE staff_attendance
       SET sign_out_time = ?,
           sign_out_early = ?,
           sign_out_early_reason = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        now.toISOString(),
        early ? 1 : 0,
        early ? req.body?.early_reason || null : null,
        record.id
      ]
    );

    res.json({ message: 'Sign-out successful' });
  } catch {
    res.status(500).json({ error: 'Failed to sign out' });
  }
});

// ============================
// ADMIN: ALL ATTENDANCE (FIXED)
// ============================
router.get(
  '/admin/view',
  authenticateToken,
  requireRole('Admin'),
  async (req, res) => {
    try {
      const rows = await db.all(
        `SELECT sa.*, u.email
         FROM staff_attendance sa
         LEFT JOIN users u ON u.id = sa.user_id
         ORDER BY sa.attendance_date DESC`
      );

      res.json({ attendance: rows });
    } catch {
      res.status(500).json({ error: 'Admin view failed' });
    }
  }
);

// ============================
// ADMIN: WEEKLY VIEW (NEW)
// ============================
router.get(
  '/admin/weekly',
  authenticateToken,
  requireRole('Admin'),
  async (req, res) => {
    try {
      const base = req.query.week_start
        ? new Date(req.query.week_start)
        : new Date();

      const start = formatISO(startOfWeek(base), { representation: 'date' });
      const end = formatISO(endOfWeek(base), { representation: 'date' });

      const rows = await db.all(
        `SELECT sa.*, u.email
         FROM staff_attendance sa
         LEFT JOIN users u ON u.id = sa.user_id
         WHERE sa.attendance_date BETWEEN ? AND ?
         ORDER BY sa.user_id, sa.attendance_date`,
        [start, end]
      );

      res.json({
        week_start: start,
        week_end: end,
        attendance: rows
      });
    } catch {
      res.status(500).json({ error: 'Weekly view failed' });
    }
  }
);

// ============================
// ADMIN: Approve / Reject
// ============================
router.put(
  '/:id/approve',
  authenticateToken,
  requireRole('Admin'),
  async (req, res) => {
    if (!['Approved', 'Rejected'].includes(req.body.status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    await db.run(
      `UPDATE staff_attendance
       SET status = ?, approved_by = ?, approved_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [req.body.status, req.user.id, req.params.id]
    );

    res.json({ message: 'Attendance updated' });
  }
);

module.exports = router;
