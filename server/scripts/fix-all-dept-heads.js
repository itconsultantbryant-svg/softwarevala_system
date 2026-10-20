const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.resolve(__dirname, '../../database/pms.db');
const defaultPassword = 'DeptHead@123';

async function fixAllDepartmentHeads() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Database connection error:', err);
        reject(err);
        return;
      }

      console.log('Connected to database:', dbPath);
      console.log('Fixing all department head accounts...\n');

      // Get all department heads
      db.all(`
        SELECT u.id, u.email, u.name, u.role, u.password_hash, d.name as dept_name, d.head_email
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

        console.log(`Found ${users.length} department head(s):\n`);

        let fixed = 0;
        let skipped = 0;

        for (const user of users) {
          console.log(`Processing: ${user.name} (${user.email})`);
          console.log(`  Department: ${user.dept_name || 'N/A'}`);
          console.log(`  Current password hash: ${user.password_hash ? `SET (${user.password_hash.length} chars)` : 'MISSING'}`);

          // Check if password hash exists and is valid
          const needsPassword = !user.password_hash || 
                                user.password_hash.length < 20 || 
                                !user.password_hash.startsWith('$2');

          if (needsPassword) {
            try {
              const passwordHash = await bcrypt.hash(defaultPassword, 10);
              
              db.run(
                'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                [passwordHash, user.id],
                function(updateErr) {
                  if (updateErr) {
                    console.error(`  ❌ Error updating password: ${updateErr.message}`);
                    skipped++;
                  } else {
                    console.log(`  ✅ Password reset to: ${defaultPassword}`);
                    fixed++;
                  }

                  // Check if we're done
                  if (fixed + skipped === users.length) {
                    console.log(`\n✅ Fix completed!`);
                    console.log(`  Fixed: ${fixed}`);
                    console.log(`  Skipped: ${skipped}`);
                    console.log(`\nDefault password for all department heads: ${defaultPassword}`);
                    db.close();
                    resolve();
                  }
                }
              );
            } catch (hashErr) {
              console.error(`  ❌ Error hashing password: ${hashErr.message}`);
              skipped++;
              if (fixed + skipped === users.length) {
                db.close();
                resolve();
              }
            }
          } else {
            console.log(`  ✓ Password already set (skipping)`);
            skipped++;
            if (fixed + skipped === users.length) {
              console.log(`\n✅ Fix completed!`);
              console.log(`  Fixed: ${fixed}`);
              console.log(`  Skipped: ${skipped}`);
              console.log(`\nDefault password for all department heads: ${defaultPassword}`);
              db.close();
              resolve();
            }
          }
        }

        if (users.length === 0) {
          console.log('No department heads found');
          db.close();
          resolve();
        }
      });
    });
  });
}

// Run the fix
fixAllDepartmentHeads()
  .then(() => {
    console.log('\n✅ All department heads fixed!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Error:', error);
    process.exit(1);
  });

