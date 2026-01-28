const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'default-secret-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

/**
 * Hash a password using bcrypt
 */
async function hashPassword(password) {
  const saltRounds = 10;
  return await bcrypt.hash(password, saltRounds);
}

/**
 * Compare password with hash
 */
async function comparePassword(password, hash) {
  return await bcrypt.compare(password, hash);
}

/**
 * Generate JWT token
 */
function generateToken(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role,
    username: user.username,
    name: user.name || null
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify JWT token
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    return null;
  }
}

/**
 * Middleware to authenticate requests
 */
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }

  req.user = decoded;
  next();
}

/**
 * Middleware to check role permissions
 */
function requireRole(...allowedRoles) {
  const flat = allowedRoles.flat();
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!flat.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    next();
  };
}

const HR_OFFICER_EMAILS = ['samantha@prinstinegroup.org'];

/**
 * Middleware: Allow Admin, HumanResourcesDepartmentHead, or HR Officer by email (samantha@prinstinegroup.org)
 */
function requireStaffManagement(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const email = ((req.user.email ?? '') + '').toLowerCase().trim();
  const allowed =
    ['Admin', 'HumanResourcesDepartmentHead'].includes(req.user.role) ||
    HR_OFFICER_EMAILS.includes(email);
  if (!allowed) {
    return res.status(403).json({ error: 'Insufficient permissions for staff management' });
  }
  next();
}

/**
 * Check permission for a specific module and action
 */
async function checkPermission(db, role, module, action) {
  const permission = await db.get(
    'SELECT granted FROM permissions WHERE role = ? AND module = ? AND action = ?',
    [role, module, action]
  );
  return permission && permission.granted === 1;
}

/**
 * Middleware to check module permissions
 */
function requirePermission(module, action) {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const db = require('../config/database');
    const hasPermission = await checkPermission(db, req.user.role, module, action);

    if (!hasPermission) {
      return res.status(403).json({ error: 'Insufficient permissions for this action' });
    }

    next();
  };
}

const STUDENT_PAYMENT_EMAILS = ['sean@prinstinegroup.org', 'cvulue@prinstinegroup.org'];

/**
 * Middleware: Allow Student Payments only for Finance head, Assistant Finance (Sean),
 * Academy head, Academy staff (cvulue@). Admin always allowed.
 */
function requireStudentPaymentAccess() {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const email = ((req.user.email ?? '') + '').toLowerCase().trim();
    if (req.user.role === 'Admin') return next();
    if (STUDENT_PAYMENT_EMAILS.includes(email)) return next();
    if (req.user.role === 'DepartmentHead') {
      const db = require('../config/database');
      const dept = await db.get(
        'SELECT id, name FROM departments WHERE manager_id = ? OR LOWER(TRIM(head_email)) = ?',
        [req.user.id, email]
      );
      if (dept && dept.name) {
        const n = dept.name.toLowerCase();
        if (n.includes('finance') || n.includes('academy') || n.includes('elearning')) return next();
      }
    }
    return res.status(403).json({ error: 'Only Finance head, Assistant Finance Officer, Academy head, or Academy staff can access student payments' });
  };
}

module.exports = {
  hashPassword,
  comparePassword,
  generateToken,
  verifyToken,
  authenticateToken,
  requireRole,
  requireStaffManagement,
  requireStudentPaymentAccess,
  checkPermission,
  requirePermission
};

