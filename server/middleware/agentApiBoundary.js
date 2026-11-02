const { verifyToken } = require('../utils/auth');

// Defence in depth: the agent portal has dedicated, ownership-scoped APIs.
// Do not allow an Agent JWT to be reused against legacy company-wide modules.
function agentApiBoundary(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const decoded = token ? verifyToken(token) : null;
  if (!decoded || String(decoded.role || '').toLowerCase() !== 'freelancemarketingagent') return next();

  const path = req.path.replace(/\/$/, '') || '/';
  const allowed =
    path.startsWith('/agent') ||
    path === '/auth/me' ||
    path === '/auth/change-password' ||
    path === '/auth/forgot-password' ||
    path === '/auth/reset-password' ||
    path === '/notifications' ||
    path === '/notifications/unread-count' ||
    /^\/notifications\/[^/]+\/read$/.test(path) ||
    path === '/notifications/read-all';
  if (!allowed) return res.status(403).json({ error: 'Freelance Marketing Agent accounts may access only the agent portal APIs' });
  next();
}

module.exports = agentApiBoundary;
