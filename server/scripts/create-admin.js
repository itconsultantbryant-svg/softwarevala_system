#!/usr/bin/env node

/**
 * Script to create or reset admin user
 * Usage: node scripts/create-admin.js
 */

const db = require('../config/database');
const { hashPassword } = require('../utils/auth');
const path = require('path');
const fs = require('fs');

async function createAdmin() {
  try {
    // Ensure database directory exists
    const dbDir = path.resolve(__dirname, '../../database');
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    await db.connect();
    console.log('Connected to database');

    // Check if admin exists
    const existingAdmin = await db.get('SELECT id FROM users WHERE email = ?', ['admin@softwarevalalib.app']);
    
    const passwordHash = await hashPassword('Admin@123!');
    
    if (existingAdmin) {
      // Update existing admin
      await db.run(
        'UPDATE users SET password_hash = ?, is_active = 1, email_verified = 1 WHERE email = ?',
        [passwordHash, 'admin@softwarevalalib.app']
      );
      console.log('✓ Admin user password reset successfully');
    } else {
      // Create new admin
      await db.run(
        `INSERT INTO users (email, username, password_hash, role, name, is_active, email_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ['admin@softwarevalalib.app', 'admin', passwordHash, 'Admin', 'System Administrator', 1, 1]
      );
      console.log('✓ Admin user created successfully');
    }

    // Verify
    const admin = await db.get('SELECT id, email, role, is_active FROM users WHERE email = ?', ['admin@softwarevalalib.app']);
    console.log('Admin user details:', {
      id: admin.id,
      email: admin.email,
      role: admin.role,
      is_active: admin.is_active
    });

    await db.close();
    console.log('Done!');
    process.exit(0);
  } catch (error) {
    console.error('Error creating admin:', error);
    process.exit(1);
  }
}

createAdmin();

