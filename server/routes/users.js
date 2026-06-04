const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const { hashPassword } = require('../utils/auth');
const { normalizeProfileImage } = require('../utils/normalizeProfileImage');
const { normalizeAccountEmail } = require('../utils/emailNormalize');
const { generateInstructorId } = require('../utils/academyIds');
const { logAction } = require('../utils/audit');

// Get all users (Admin, DepartmentHead, and Staff can access for requisitions, meetings, etc.)
router.get('/', authenticateToken, async (req, res) => {
  try {
    // All authenticated users can access this endpoint
    // (needed for requisitions, meetings, call memos, etc.)

    const { role, search } = req.query;
    let query = `
      SELECT id, email, username, role, name, phone, profile_image, is_active, email_verified, created_at
      FROM users
      WHERE 1=1
    `;
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }
    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ? OR username LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    query += ' ORDER BY created_at DESC';

    const users = await db.all(query, params);
    res.json({ users });
  } catch (error) {
    console.error('Get users error:', error);
    if (error.message && error.message.includes('no such table')) {
      console.warn('users table does not exist yet');
      return res.json({ users: [] });
    }
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get single user
router.get('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await db.get(
      `SELECT id, email, username, role, name, phone, profile_image, is_active, email_verified, created_at
       FROM users WHERE id = ?`,
      [userId]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

// Create user (Admin only)
router.post('/', authenticateToken, requireRole('Admin'), [
  body('email').isEmail().normalizeEmail(),
  body('name').trim().notEmpty(),
  body('role').isIn(['Admin', 'Staff', 'Instructor', 'Student', 'Client', 'Partner'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, name, username, phone, role, password, is_active, profile_image } = req.body;
    const normalizedProfileImage = normalizeProfileImage(profile_image) ?? null;
    const normEmail = normalizeAccountEmail(email);
    if (!normEmail) {
      return res.status(400).json({ error: 'A valid email address is required.' });
    }

    // Check if user exists
    const existingUser = await db.get(
      'SELECT id FROM users WHERE LOWER(TRIM(email)) = ?',
      [normEmail]
    );
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    const defaultPassword =
      password ||
      (role === 'Instructor' ? 'Instructor@123' : role === 'Student' ? 'Student@123' : 'User@123');
    const passwordHash = await hashPassword(defaultPassword);
    const usernameToStore = (username || normEmail.split('@')[0]).trim();

    // Create user
    const result = await db.run(
      `INSERT INTO users (email, username, password_hash, role, name, phone, profile_image, is_active, email_verified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        normEmail,
        usernameToStore,
        passwordHash,
        role,
        name,
        phone || null,
        normalizedProfileImage,
        is_active !== undefined ? (is_active ? 1 : 0) : 1,
        1
      ]
    );

    if (role === 'Instructor') {
      await db.run(
        `INSERT INTO instructors (user_id, instructor_id, approved, created_at, updated_at)
         VALUES (?, ?, 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [result.lastID, generateInstructorId()]
      );
    }

    await logAction(req.user.id, 'create_user', 'users', result.lastID, { email, role }, req);

    res.status(201).json({
      message: 'User created successfully',
      user: { id: result.lastID, email, role }
    });
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ error: 'Failed to create user: ' + error.message });
  }
});

// Update user (Admin only)
router.put('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const userId = req.params.id;
    const updates = req.body;

    const user = await db.get('SELECT id FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const updateFields = [];
    const params = [];

    const allowedFields = ['name', 'username', 'phone', 'role', 'is_active', 'profile_image'];
    allowedFields.forEach(field => {
      if (updates[field] !== undefined) {
        if (field === 'is_active') {
          updateFields.push(`${field} = ?`);
          params.push(updates[field] ? 1 : 0);
        } else if (field === 'profile_image') {
          updateFields.push(`${field} = ?`);
          params.push(normalizeProfileImage(updates[field]));
        } else {
          updateFields.push(`${field} = ?`);
          params.push(updates[field]);
        }
      }
    });

    if (updateFields.length > 0) {
      params.push(userId);
      await db.run(`UPDATE users SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, params);
    }

    await logAction(req.user.id, 'update_user', 'users', userId, updates, req);

    res.json({ message: 'User updated successfully' });
  } catch (error) {
    console.error('Update user error:', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user (Admin only)
router.delete('/:id', authenticateToken, requireRole('Admin'), async (req, res) => {
  try {
    const userId = req.params.id;

    const user = await db.get('SELECT id, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting the last admin
    if (user.role === 'Admin') {
      const adminCount = await db.get('SELECT COUNT(*) as count FROM users WHERE role = ? AND is_active = 1', ['Admin']);
      if (adminCount.count <= 1) {
        return res.status(400).json({ error: 'Cannot delete the last active admin user' });
      }
    }

    // Prevent deleting users with active targets (targets will be auto-deleted via CASCADE)
    const activeTargets = await db.get(
      'SELECT COUNT(*) as count FROM targets WHERE user_id = ? AND status = ?',
      [userId, 'Active']
    );
    if (activeTargets && activeTargets.count > 0) {
      return res.status(400).json({ 
        error: `Cannot delete user with ${activeTargets.count} active target(s). Please cancel or complete the targets first, or delete them manually.` 
      });
    }

    await db.run('DELETE FROM users WHERE id = ?', [userId]);

    await logAction(req.user.id, 'delete_user', 'users', userId, {}, req);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

// Reset password for a user (Admin only)
router.post('/:id/reset-password', authenticateToken, requireRole('Admin'), [
  body('new_password').trim().isLength({ min: 6 }).withMessage('Password must be at least 6 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const userId = req.params.id;
    const { new_password } = req.body;

    const user = await db.get('SELECT id, email, role FROM users WHERE id = ?', [userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const passwordHash = await hashPassword(new_password);
    await db.run(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, userId]
    );

    await logAction(req.user.id, 'reset_password', 'users', userId, { user_email: user.email }, req);

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
});

module.exports = router;

