const { verifyToken } = require('../utils/auth');

/**
 * Decode Bearer JWT into req._auditUserId (no 401) so HTTP audit middleware can
 * attribute requests before route-level authenticateToken runs.
 */
function attachAuditUserFromToken(req, res, next) {
  req._auditUserId = null;
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (token) {
    const decoded = verifyToken(token);
    if (decoded && decoded.id) {
      req._auditUserId = decoded.id;
    }
  }
  next();
}

module.exports = attachAuditUserFromToken;
