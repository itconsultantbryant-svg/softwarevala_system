const db = require('../config/database');
const { hashPassword, comparePassword } = require('../utils/auth');

async function fixStudentLogins() {
  try {
    await db.connect();
    console.log('=== Fixing Student Login Issues ===\n');

    const defaultPassword = 'Student@123';
    const newHash = await hashPassword(defaultPassword);

    // Verify the hash works
    const hashWorks = await comparePassword(defaultPassword, newHash);
    if (!hashWorks) {
      console.error('FATAL: Generated hash does not verify against the default password!');
      process.exit(1);
    }
    console.log('Generated valid bcrypt hash for default password "Student@123"\n');

    // Get all student users
    const students = await db.all(
      `SELECT u.id, u.email, u.username, u.role, u.name, u.is_active, u.password_hash, s.student_id, s.status
       FROM users u
       JOIN students s ON s.user_id = u.id
       WHERE LOWER(u.role) = 'student'`
    );

    console.log(`Found ${students.length} student accounts in database.\n`);

    let passwordsReset = 0;
    let accountsActivated = 0;
    let alreadyOk = 0;

    for (const student of students) {
      const issues = [];

      // Check if password hash is missing or invalid
      const hasValidHash = student.password_hash &&
        student.password_hash.startsWith('$2') &&
        student.password_hash.length >= 50;

      // Check if current password already matches default
      let passwordMatches = false;
      if (hasValidHash) {
        try {
          passwordMatches = await comparePassword(defaultPassword, student.password_hash);
        } catch (e) {
          passwordMatches = false;
        }
      }

      if (!passwordMatches) {
        issues.push('password does not match default');
      }

      if (!student.is_active) {
        issues.push('account inactive (is_active=0)');
      }

      if (issues.length === 0) {
        alreadyOk++;
        continue;
      }

      console.log(`Fixing: ${student.email} (ID: ${student.id}, Student ID: ${student.student_id})`);
      console.log(`  Issues: ${issues.join(', ')}`);

      // Reset password and activate account
      await db.run(
        `UPDATE users SET password_hash = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [newHash, student.id]
      );

      if (!passwordMatches) passwordsReset++;
      if (!student.is_active) accountsActivated++;

      console.log('  Fixed!\n');
    }

    // Also fix any student users without a students record (orphaned user accounts with Student role)
    const orphanedStudents = await db.all(
      `SELECT u.id, u.email, u.is_active, u.password_hash
       FROM users u
       LEFT JOIN students s ON s.user_id = u.id
       WHERE LOWER(u.role) = 'student' AND s.id IS NULL`
    );

    if (orphanedStudents.length > 0) {
      console.log(`\nFound ${orphanedStudents.length} orphaned student user accounts (no student record):`);
      for (const orphan of orphanedStudents) {
        console.log(`  - ${orphan.email} (User ID: ${orphan.id})`);
        await db.run(
          `UPDATE users SET password_hash = ?, is_active = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [newHash, orphan.id]
        );
        passwordsReset++;
        if (!orphan.is_active) accountsActivated++;
      }
    }

    console.log('\n=== Summary ===');
    console.log(`Total student accounts: ${students.length}`);
    console.log(`Passwords reset to "Student@123": ${passwordsReset}`);
    console.log(`Accounts activated (is_active set to 1): ${accountsActivated}`);
    console.log(`Already working correctly: ${alreadyOk}`);
    console.log(`Orphaned student users fixed: ${orphanedStudents.length}`);
    console.log('\nAll students should now be able to log in with their email and password "Student@123".');

    await db.close();
  } catch (error) {
    console.error('Error fixing student logins:', error);
    process.exit(1);
  }
}

fixStudentLogins();
