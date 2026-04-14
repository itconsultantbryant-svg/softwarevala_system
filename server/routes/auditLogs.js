const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const { canReadAuditTrail } = require('../utils/ictAuditAccess');

async function requireAuditTrailReadAccess(req, res, next) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const ok = await canReadAuditTrail(req.user);
    if (!ok) {
      return res.status(403).json({
        error: 'Only Admin or the ICT Department Head can access the system audit trail (read-only).'
      });
    }
    next();
  } catch (e) {
    next(e);
  }
}

router.get('/access', authenticateToken, requireAuditTrailReadAccess, (req, res) => {
  res.json({ ok: true });
});

/**
 * Query: start, end (YYYY-MM-DD), user_id, module, action, search, page, limit
 */
router.get('/', authenticateToken, requireAuditTrailReadAccess, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const conditions = ['1=1'];
    const params = [];

    if (req.query.start) {
      conditions.push('a.created_at >= ?');
      params.push(`${req.query.start}T00:00:00.000`);
    }
    if (req.query.end) {
      conditions.push('a.created_at <= ?');
      params.push(`${req.query.end}T23:59:59.999`);
    }
    if (req.query.user_id) {
      conditions.push('a.user_id = ?');
      params.push(parseInt(req.query.user_id, 10));
    }
    if (req.query.module) {
      conditions.push('a.module LIKE ?');
      params.push(`%${String(req.query.module).trim()}%`);
    }
    if (req.query.action) {
      conditions.push('a.action LIKE ?');
      params.push(`%${String(req.query.action).trim()}%`);
    }
    if (req.query.search) {
      const q = `%${String(req.query.search).trim()}%`;
      conditions.push(
        '(a.action LIKE ? OR a.module LIKE ? OR COALESCE(a.details, \'\') LIKE ? OR COALESCE(u.name, \'\') LIKE ? OR COALESCE(u.email, \'\') LIKE ?)'
      );
      params.push(q, q, q, q, q);
    }

    const whereSql = conditions.join(' AND ');

    const countRow = await db.get(
      `SELECT COUNT(*) AS c FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}`,
      params
    );
    const total = countRow ? parseInt(countRow.c, 10) || 0 : 0;

    const rows = await db.all(
      `SELECT a.id, a.user_id, a.action, a.module, a.record_id, a.details, a.ip_address, a.user_agent, a.created_at,
              u.name AS user_name, u.email AS user_email
       FROM audit_logs a
       LEFT JOIN users u ON u.id = a.user_id
       WHERE ${whereSql}
       ORDER BY a.created_at DESC, a.id DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const logs = (rows || []).map((row) => {
      let detailsParsed = null;
      if (row.details) {
        try {
          detailsParsed = JSON.parse(row.details);
        } catch {
          detailsParsed = row.details;
        }
      }
      return { ...row, details: detailsParsed };
    });

    res.json({
      logs,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1
    });
  } catch (err) {
    console.error('auditLogs list error:', err);
    res.status(500).json({ error: 'Failed to load audit logs' });
  }
});

module.exports = router;
