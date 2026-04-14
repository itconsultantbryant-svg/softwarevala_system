const db = require('../config/database');

/**
 * True if the user is the head of a department whose name indicates ICT.
 */
async function isIctDepartmentHeadUser(user) {
  if (!user || user.role !== 'DepartmentHead') return false;
  const email = (user.email || '').toLowerCase().trim();
  const row = await db.get(
    `SELECT id FROM departments
     WHERE (manager_id = ? OR LOWER(TRIM(COALESCE(head_email, ''))) = ?)
       AND (LOWER(name) LIKE '%ict%' OR LOWER(name) LIKE '%information technology%')`,
    [user.id, email]
  );
  return !!row;
}

/**
 * Admin: read-only. ICT Department Head: read-only. All routes are GET-only.
 */
async function canReadAuditTrail(user) {
  if (!user) return false;
  if (user.role === 'Admin') return true;
  return isIctDepartmentHeadUser(user);
}

module.exports = { isIctDepartmentHeadUser, canReadAuditTrail };
