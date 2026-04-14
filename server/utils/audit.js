const db = require('../config/database');

/**
 * Log an action to audit logs
 */
async function logAction(userId, action, module, recordId = null, details = null, req = null) {
  try {
    const ipAddress = req ? req.ip || req.connection.remoteAddress : null;
    const userAgent = req ? req.get('user-agent') : null;

    await db.run(
      `INSERT INTO audit_logs (user_id, action, module, record_id, details, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        module,
        recordId,
        details ? JSON.stringify(details) : null,
        ipAddress,
        userAgent
      ]
    );
  } catch (error) {
    console.error('Error logging audit action:', error);
    // Don't throw - audit logging shouldn't break the main flow
  }
}

/**
 * Automatic API access row (complements semantic logAction calls across routes).
 * Fire-and-forget from middleware — never throws to caller.
 */
async function logHttpApiAccess({
  userId,
  method,
  path: requestPath,
  statusCode,
  durationMs,
  ipAddress,
  userAgent,
  module
}) {
  try {
    const details = JSON.stringify({
      method,
      path: requestPath,
      status_code: statusCode,
      duration_ms: durationMs
    });
    await db.run(
      `INSERT INTO audit_logs (user_id, action, module, record_id, details, ip_address, user_agent)
       VALUES (?, 'http_request', ?, NULL, ?, ?, ?)`,
      [userId, module, details, ipAddress || null, userAgent || null]
    );
  } catch (error) {
    console.error('Error logging HTTP audit:', error);
  }
}

module.exports = { logAction, logHttpApiAccess };

