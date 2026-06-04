/**
 * Repair instructor login accounts on startup (production PostgreSQL / SQLite).
 */
const bcrypt = require('bcrypt');
const db = require('../config/database');
const { generateInstructorId } = require('./academyIds');

const DEFAULT_INSTRUCTOR_PASSWORD = 'Instructor@123';
const LEGACY_INSTRUCTOR_PASSWORD = 'User@123';

async function passwordMatchesAnyDefault(hash) {
  if (!hash || !hash.startsWith('$2')) return false;
  try {
    if (await bcrypt.compare(DEFAULT_INSTRUCTOR_PASSWORD, hash)) return true;
  } catch (_e) {
    return false;
  }
  return false;
}

async function ensureInstructorLoginAccounts() {
  const saltRounds = 10;
  const defaultHash = await bcrypt.hash(DEFAULT_INSTRUCTOR_PASSWORD, saltRounds);

  const instructorUsers = await db.all(
    `SELECT u.id, u.email, u.password_hash, u.is_active
     FROM users u
     WHERE LOWER(TRIM(u.role)) = 'instructor'`
  );

  if (!instructorUsers.length) {
    console.log('✓ No instructor accounts to verify');
    return { verified: 0, fixed: 0, recordsCreated: 0 };
  }

  let fixed = 0;
  let recordsCreated = 0;

  for (const row of instructorUsers) {
    let needsPasswordFix = false;

    if (!row.password_hash || !row.password_hash.startsWith('$2')) {
      needsPasswordFix = true;
    } else {
      const matchesDefault = await passwordMatchesAnyDefault(row.password_hash);
      if (!matchesDefault) needsPasswordFix = true;
    }

    if (!row.is_active) {
      await db.run(`UPDATE users SET is_active = 1 WHERE id = ?`, [row.id]);
      fixed++;
    }

    if (needsPasswordFix) {
      await db.run(`UPDATE users SET password_hash = ? WHERE id = ?`, [defaultHash, row.id]);
      fixed++;
    }

    const inst = await db.get('SELECT id FROM instructors WHERE user_id = ?', [row.id]);
    if (!inst) {
      await db.run(
        `INSERT INTO instructors (user_id, instructor_id, approved, created_at, updated_at)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [row.id, generateInstructorId()]
      );
      recordsCreated++;
    }
  }

  if (fixed > 0 || recordsCreated > 0) {
    console.log(
      `✓ Fixed ${fixed} instructor login account(s) (password/active) and created ${recordsCreated} missing instructor record(s)`
    );
  } else {
    console.log(`✓ All ${instructorUsers.length} instructor account(s) verified – logins OK`);
  }

  return { verified: instructorUsers.length, fixed, recordsCreated };
}

module.exports = {
  DEFAULT_INSTRUCTOR_PASSWORD,
  LEGACY_INSTRUCTOR_PASSWORD,
  ensureInstructorLoginAccounts
};
