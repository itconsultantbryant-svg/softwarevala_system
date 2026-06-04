#!/usr/bin/env node
/**
 * Fix instructor login accounts: reset broken passwords to Instructor@123,
 * activate accounts, and create missing instructors table rows.
 * Usage: node scripts/fix-instructor-logins.js
 */
const db = require('../config/database');
const { ensureInstructorLoginAccounts, DEFAULT_INSTRUCTOR_PASSWORD } = require('../utils/ensureInstructorAccounts');
const { comparePassword } = require('../utils/auth');

async function main() {
  await db.connect();
  console.log(`=== Fixing instructor logins (default password: ${DEFAULT_INSTRUCTOR_PASSWORD}) ===\n`);

  const result = await ensureInstructorLoginAccounts();

  const instructors = await db.all(
    `SELECT u.id, u.email, u.username, u.is_active, i.approved, i.instructor_id
     FROM users u
     LEFT JOIN instructors i ON i.user_id = u.id
     WHERE LOWER(TRIM(u.role)) = 'instructor'
     ORDER BY u.email`
  );

  console.log('\nInstructor accounts:');
  for (const row of instructors) {
    const user = await db.get('SELECT password_hash FROM users WHERE id = ?', [row.id]);
    const ok = user?.password_hash
      ? await comparePassword(DEFAULT_INSTRUCTOR_PASSWORD, user.password_hash)
      : false;
    console.log(
      `  ${row.email} | active=${row.is_active} | approved=${row.approved ?? '—'} | defaultPwd=${ok ? 'OK' : 'FAIL'} | record=${row.instructor_id || 'MISSING'}`
    );
  }

  console.log('\nSummary:', result);
  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
