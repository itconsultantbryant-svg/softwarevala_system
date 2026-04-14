const { logHttpApiAccess } = require('../utils/audit');

function deriveModule(pathOnly) {
  const withoutQuery = pathOnly.split('?')[0];
  const parts = withoutQuery.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const first = parts[0] || 'api';
  return `api:${first}`;
}

function shouldSkipHttpAudit(pathOnly, method) {
  if (method === 'OPTIONS') return true;
  if (!pathOnly.startsWith('/api')) return true;
  if (pathOnly.startsWith('/api/audit-logs')) return true;
  // Login is already logged semantically; skip duplicate http_request row
  if (method === 'POST' && pathOnly.replace(/\/$/, '') === '/api/auth/login') return true;
  return false;
}

/**
 * Logs one row per completed API response (method, path, status, duration, user when known).
 */
function auditHttpLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const pathOnly = (req.originalUrl || req.url || '').split('?')[0];
    if (shouldSkipHttpAudit(pathOnly, req.method)) return;

    const userId = req.user && req.user.id != null ? req.user.id : req._auditUserId;
    const durationMs = Date.now() - start;
    const ip =
      req.ip ||
      (req.headers && req.headers['x-forwarded-for'] && String(req.headers['x-forwarded-for']).split(',')[0].trim()) ||
      (req.connection && req.connection.remoteAddress) ||
      null;
    const ua = req.get ? req.get('user-agent') : req.headers['user-agent'];

    setImmediate(() => {
      logHttpApiAccess({
        userId: userId != null ? userId : null,
        method: req.method,
        path: pathOnly,
        statusCode: res.statusCode,
        durationMs,
        ipAddress: ip,
        userAgent: ua || null,
        module: deriveModule(pathOnly)
      });
    });
  });
  next();
}

module.exports = auditHttpLogger;
