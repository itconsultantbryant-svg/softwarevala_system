const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../../database/pms.db');
const testPassword = 'DeptHead@123';

async function testDepartmentHeadLogins() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
        return;
      }

      console.log('Testing Department Head Logins\n');
      console.log('='.repeat(60));

      // Get all department heads
      db.all(`
        SELECT u.id, u.email, u.name, u.role, u.password_hash, u.is_active,
               d.name as dept_name, d.head_email
        FROM users u
        LEFT JOIN departments d ON u.id = d.manager_id OR LOWER(TRIM(u.email)) = LOWER(TRIM(d.head_email))
        WHERE u.role = 'DepartmentHead'
        ORDER BY u.name
      `, async (err, users) => {
        if (err) {
          console.error('Error fetching users:', err);
          db.close();
          reject(err);
          return;
        }

        console.log(`\nFound ${users.length} department head(s):\n`);

        for (let i = 0; i < users.length; i++) {
          const user = users[i];
          console.log(`${i + 1}. ${user.name}`);
          console.log(`   Email: ${user.email}`);
          console.log(`   Department: ${user.dept_name || 'N/A'}`);
          console.log(`   Department head_email: ${user.head_email || 'N/A'}`);
          console.log(`   Is Active: ${user.is_active ? 'Yes' : 'No'}`);
          console.log(`   Password Hash: ${user.password_hash ? `SET (${user.password_hash.length} chars)` : 'MISSING'}`);
          
          // Test email matching
          const normalizedEmail = user.email.toLowerCase().trim();
          console.log(`   Normalized Email: "${normalizedEmail}"`);
          
          // Test password verification
          if (user.password_hash) {
            try {
              const isValid = await bcrypt.compare(testPassword, user.password_hash);
              console.log(`   Password Test (${testPassword}): ${isValid ? '✅ VALID' : '❌ INVALID'}`);
              
              if (!isValid) {
                console.log(`   ⚠️  Password does not match default password!`);
              }
            } catch (err) {
              console.log(`   ❌ Password verification error: ${err.message}`);
            }
          } else {
            console.log(`   ❌ No password hash found!`);
          }
          
          // Test email lookup queries
          console.log(`   Testing email lookup:`);
          
          // Test 1: LOWER(TRIM(email))
          db.get(
            'SELECT id, email FROM users WHERE LOWER(TRIM(email)) = ?',
            [normalizedEmail],
            (err, result) => {
              if (err) {
                console.log(`     Query 1 (LOWER(TRIM)): ❌ Error - ${err.message}`);
              } else if (result) {
                console.log(`     Query 1 (LOWER(TRIM)): ✅ Found - ${result.email}`);
              } else {
                console.log(`     Query 1 (LOWER(TRIM)): ❌ Not found`);
              }
            }
          );
          
          // Test 2: LOWER(email)
          db.get(
            'SELECT id, email FROM users WHERE LOWER(email) = ?',
            [normalizedEmail],
            (err, result) => {
              if (err) {
                console.log(`     Query 2 (LOWER): ❌ Error - ${err.message}`);
              } else if (result) {
                console.log(`     Query 2 (LOWER): ✅ Found - ${result.email}`);
              } else {
                console.log(`     Query 2 (LOWER): ❌ Not found`);
              }
            }
          );
          
          // Test 3: Exact match
          db.get(
            'SELECT id, email FROM users WHERE email = ?',
            [user.email],
            (err, result) => {
              if (err) {
                console.log(`     Query 3 (Exact): ❌ Error - ${err.message}`);
              } else if (result) {
                console.log(`     Query 3 (Exact): ✅ Found - ${result.email}`);
              } else {
                console.log(`     Query 3 (Exact): ❌ Not found`);
              }
            }
          );
          
          console.log('');
        }

        // Wait a bit for async operations
        setTimeout(() => {
          console.log('\n' + '='.repeat(60));
          console.log('\n✅ Test completed!');
          console.log(`\nDefault password for testing: ${testPassword}`);
          console.log('\nIf passwords are invalid, run:');
          console.log('  node server/scripts/fix-all-dept-heads.js');
          db.close();
          resolve();
        }, 2000);
      });
    });
  });
}

// Run the test
testDepartmentHeadLogins()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

