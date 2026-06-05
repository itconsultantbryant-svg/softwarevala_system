const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const db = require('../config/database');
const { authenticateToken, requireRole } = require('../utils/auth');
const uploadCommunications = require('../utils/uploadCommunications');
const {
  getUserNotifications,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  createNotification,
  sendBulkNotifications,
  sendNotificationToRole,
  sendNotificationToAll,
  acknowledgeNotification,
  getNotificationThread
} = require('../utils/notifications');

// Get user notifications
router.get('/', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    const notifications = await getUserNotifications(req.user.id, limit, offset);
    res.json({ notifications });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// Get unread count
router.get('/unread-count', authenticateToken, async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.id);
    res.json({ count });
  } catch (error) {
    console.error('Get unread count error:', error);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Mark notification as read
router.put('/:id/read', authenticateToken, async (req, res) => {
  try {
    const notificationId = req.params.id;
    await markAsRead(notificationId, req.user.id);
    res.json({ message: 'Notification marked as read' });
  } catch (error) {
    console.error('Mark notification as read error:', error);
    res.status(500).json({ error: 'Failed to mark notification as read' });
  }
});

// Mark all notifications as read
router.put('/read-all', authenticateToken, async (req, res) => {
  try {
    await markAllAsRead(req.user.id);
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all as read error:', error);
    res.status(500).json({ error: 'Failed to mark all notifications as read' });
  }
});

// Send notification/communication (All authenticated users can send)
router.post('/send', authenticateToken, uploadCommunications.array('attachments', 10), [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['info', 'success', 'warning', 'error']).withMessage('Invalid notification type'),
  body('link').optional().trim(),
  // userIds can be a string (JSON) from FormData or an array - we'll parse it in the handler
  body('userIds').optional(),
  body('role').optional().trim(),
  body('sendToAll').optional().isBoolean(),
  body('parentId').optional().isInt().withMessage('Parent ID must be an integer')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      console.error('[Notifications] Validation errors:', errors.array());
      return res.status(400).json({ errors: errors.array() });
    }

    let { title, message, type = 'info', link = null, userIds = [], role = null, sendToAll = false, parentId = null } = req.body;
    const senderId = req.user.id;
    
    // Convert sendToAll to boolean if it comes as string from FormData
    if (typeof sendToAll === 'string') {
      sendToAll = sendToAll === 'true' || sendToAll === '1';
    }
    
    // Handle userIds if sent as JSON string (from FormData)
    if (typeof userIds === 'string') {
      try {
        userIds = JSON.parse(userIds);
        // Ensure it's an array
        if (!Array.isArray(userIds)) {
          userIds = [userIds];
        }
      } catch (e) {
        // If not JSON, try splitting by comma
        console.log('[Notifications] Parsing userIds as comma-separated string:', userIds);
        userIds = userIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
      }
    }
    // Handle userIds if sent as array in FormData (userIds[] format or multiple userIds fields)
    if (Array.isArray(userIds) && userIds.length === 0 && req.body.userIds) {
      userIds = Array.isArray(req.body.userIds) ? req.body.userIds : [req.body.userIds];
    }
    
    // Ensure userIds is always an array and contains valid numbers
    if (!Array.isArray(userIds)) {
      userIds = userIds ? [userIds] : [];
    }
    userIds = userIds.map(id => {
      const numId = parseInt(id);
      return isNaN(numId) ? null : numId;
    }).filter(id => id !== null && id > 0);
    
    console.log('[Notifications] Parsed userIds:', userIds, 'from request body userIds type:', typeof req.body.userIds);

    // Handle file attachments
    let attachments = [];
    if (req.files && req.files.length > 0) {
      // Use production API base URL or construct from request
      const baseUrl = process.env.API_BASE_URL || (req.protocol + '://' + req.get('host'));
      attachments = req.files.map(file => ({
        filename: file.originalname,
        url: `${baseUrl}/uploads/communications/${file.filename}`,
        size: file.size,
        mimetype: file.mimetype
      }));
    }

    let notificationIds = [];

    // If parentId exists, this is a reply
    if (parentId) {
      // Get the parent notification to find the recipient
      const parent = await db.get('SELECT user_id, sender_id FROM notifications WHERE id = ?', [parentId]);
      if (!parent) {
        return res.status(404).json({ error: 'Parent notification not found' });
      }
      
      // Reply goes to the sender of the parent (or original recipient if no sender)
      const recipientId = parent.sender_id || parent.user_id;
      
      // Create reply notification
      const replyId = await createNotification(
        recipientId,
        `Re: ${title}`,
        message,
        type,
        link,
        senderId,
        parentId,
        attachments.length > 0 ? attachments : null
      );
      
      return res.json({
        message: 'Reply sent successfully',
        notificationId: replyId
      });
    }

    // Regular notification sending
    if (sendToAll) {
      // Only Admin can send to all
      if (req.user.role !== 'Admin') {
        return res.status(403).json({ error: 'Only administrators can send notifications to all users' });
      }
      console.log('Sending notification to all users');
      notificationIds = await sendNotificationToAll(title, message, type, link, senderId, attachments.length > 0 ? attachments : null);
      return res.json({
        message: `Notification sent to all users (${notificationIds.length} recipients)`,
        count: notificationIds.length
      });
    } else if (role) {
      // Admin can send to any role, DepartmentHead and Staff can send to Admin and DepartmentHead roles
      if (req.user.role === 'Admin') {
        // Admin can send to any role
        console.log(`Sending notification to role: ${role}`);
        notificationIds = await sendNotificationToRole(role, title, message, type, link, senderId, attachments.length > 0 ? attachments : null);
        return res.json({
          message: `Notification sent to ${role} role (${notificationIds.length} recipients)`,
          count: notificationIds.length
        });
      } else if (req.user.role === 'DepartmentHead' || req.user.role === 'Staff') {
        // DepartmentHead and Staff can send to Admin and DepartmentHead roles
        if (role !== 'Admin' && role !== 'DepartmentHead' && role !== 'Staff') {
          return res.status(403).json({ error: 'You can only send notifications to Admin, DepartmentHead, and Staff roles' });
        }
        console.log(`${req.user.role} sending notification to role: ${role}`);
        notificationIds = await sendNotificationToRole(role, title, message, type, link, senderId, attachments.length > 0 ? attachments : null);
        return res.json({
          message: `Notification sent to ${role} role (${notificationIds.length} recipients)`,
          count: notificationIds.length
        });
      } else {
        return res.status(403).json({ error: 'Only administrators, department heads, and staff can send notifications by role' });
      }
    } else if (userIds && Array.isArray(userIds) && userIds.length > 0) {
      // Send to specific users (any authenticated user can do this)
      console.log(`[Notifications] Sending to ${userIds.length} user(s):`, userIds);
      
      // Verify all user IDs exist and are active
      const placeholders = userIds.map(() => '?').join(',');
      const validUsers = await db.all(
        `SELECT id FROM users WHERE id IN (${placeholders}) AND is_active = 1`,
        userIds
      );
      const validUserIds = validUsers.map(u => u.id);
      
      if (validUserIds.length === 0) {
        return res.status(400).json({ error: 'No valid active users found with the provided IDs' });
      }
      
      if (validUserIds.length < userIds.length) {
        const invalidIds = userIds.filter(id => !validUserIds.includes(id));
        console.warn(`[Notifications] Some user IDs are invalid or inactive:`, invalidIds);
      }
      
      notificationIds = await sendBulkNotifications(validUserIds, title, message, type, link, senderId, attachments.length > 0 ? attachments : null);
      return res.json({
        message: `Notification sent to ${notificationIds.length} user(s)`,
        count: notificationIds.length,
        requested: userIds.length,
        valid: validUserIds.length
      });
    } else {
      console.error('[Notifications] No valid send mode specified. userIds:', userIds, 'role:', role, 'sendToAll:', sendToAll);
      return res.status(400).json({ error: 'Please specify userIds, role, or set sendToAll to true' });
    }
  } catch (error) {
    console.error('[Notifications] Send notification error:', error);
    console.error('[Notifications] Error stack:', error.stack);
    res.status(500).json({ error: 'Failed to send notification: ' + error.message });
  }
});

// Reply to a notification
router.post('/:id/reply', authenticateToken, uploadCommunications.array('attachments', 10), [
  body('message').trim().notEmpty().withMessage('Message is required'),
  body('type').optional().isIn(['info', 'success', 'warning', 'error'])
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const notificationId = parseInt(req.params.id);
    const { message, type = 'info' } = req.body;
    const senderId = req.user.id;

    // Get parent notification
    const parent = await db.get('SELECT id, title, user_id, sender_id FROM notifications WHERE id = ?', [notificationId]);
    if (!parent) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    // Determine recipient: reply goes to the sender of the parent
    const recipientId = parent.sender_id || parent.user_id;
    if (recipientId === senderId) {
      return res.status(400).json({ error: 'Cannot reply to your own message' });
    }

    // Handle file attachments
    let attachments = [];
    if (req.files && req.files.length > 0) {
      // Use production API base URL or construct from request
      const baseUrl = process.env.API_BASE_URL || (req.protocol + '://' + req.get('host'));
      attachments = req.files.map(file => ({
        filename: file.originalname,
        url: `${baseUrl}/uploads/communications/${file.filename}`,
        size: file.size,
        mimetype: file.mimetype
      }));
    }

    // Create reply
    const replyId = await createNotification(
      recipientId,
      `Re: ${parent.title}`,
      message,
      type,
      null,
      senderId,
      notificationId,
      attachments.length > 0 ? attachments : null
    );

    res.json({
      message: 'Reply sent successfully',
      notificationId: replyId
    });
  } catch (error) {
    console.error('Reply error:', error);
    res.status(500).json({ error: 'Failed to send reply: ' + error.message });
  }
});

// Acknowledge a notification
router.put('/:id/acknowledge', authenticateToken, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    // Verify notification belongs to user
    const notification = await db.get('SELECT user_id FROM notifications WHERE id = ?', [notificationId]);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.user_id !== req.user.id) {
      return res.status(403).json({ error: 'You can only acknowledge your own notifications' });
    }

    await acknowledgeNotification(notificationId, req.user.id);
    res.json({ message: 'Notification acknowledged' });
  } catch (error) {
    console.error('Acknowledge error:', error);
    res.status(500).json({ error: 'Failed to acknowledge notification' });
  }
});

// Get notification thread (with replies)
router.get('/:id/thread', authenticateToken, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    
    // Verify user has access (either sender or recipient)
    const notification = await db.get('SELECT user_id, sender_id FROM notifications WHERE id = ?', [notificationId]);
    if (!notification) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    
    if (notification.user_id !== req.user.id && notification.sender_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const thread = await getNotificationThread(notificationId);
    res.json({ thread });
  } catch (error) {
    console.error('Get thread error:', error);
    res.status(500).json({ error: 'Failed to fetch thread' });
  }
});

// Get all users for notification sending (All authenticated users)
router.get('/users', authenticateToken, async (req, res) => {
  try {
    const { role, search, cohort_id } = req.query;

    if (req.user.role === 'Instructor') {
      const { getInstructorByUserId, getStudentsForInstructor, parseCohortId } = require('../utils/instructorHelpers');
      const instructor = await getInstructorByUserId(req.user.id);
      if (!instructor) {
        return res.json({ users: [] });
      }
      const cohortId = parseCohortId(cohort_id);
      const students = await getStudentsForInstructor(instructor, cohortId);
      const userIds = [...new Set(students.map((s) => s.user_id).filter(Boolean))];
      if (userIds.length === 0) {
        return res.json({ users: [] });
      }
      const placeholders = userIds.map(() => '?').join(',');
      let query = `
        SELECT id, email, name, role, is_active
        FROM users
        WHERE is_active = 1 AND id IN (${placeholders})`;
      const params = [...userIds];
      if (search) {
        query += ' AND (name LIKE ? OR email LIKE ?)';
        const searchTerm = `%${search}%`;
        params.push(searchTerm, searchTerm);
      }
      query += ' ORDER BY name ASC';
      const users = await db.all(query, params);
      return res.json({ users: users.filter((u) => u.id !== req.user.id) });
    }

    let query = `
      SELECT id, email, name, role, is_active
      FROM users
      WHERE is_active = 1
    `;
    const params = [];

    if (role) {
      query += ' AND role = ?';
      params.push(role);
    }

    if (search) {
      query += ' AND (name LIKE ? OR email LIKE ?)';
      const searchTerm = `%${search}%`;
      params.push(searchTerm, searchTerm);
    }

    query += ' ORDER BY name ASC';

    const users = await db.all(query, params);
    
    // Filter out current user from list (users can't send to themselves)
    const filteredUsers = users.filter(u => u.id !== req.user.id);
    
    res.json({ users: filteredUsers });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// Get available roles for filtering
router.get('/roles', authenticateToken, async (req, res) => {
  try {
    // Admin can see all roles, DepartmentHead can see Admin and DepartmentHead
    if (req.user.role === 'Admin') {
      const roles = await db.all(
        'SELECT DISTINCT role FROM users WHERE is_active = 1 ORDER BY role'
      );
      return res.json({ roles: roles.map(r => r.role) });
    } else if (req.user.role === 'DepartmentHead' || req.user.role === 'Staff') {
      // DepartmentHead and Staff can send to Admin, DepartmentHead, and Staff roles
      return res.json({ roles: ['Admin', 'DepartmentHead', 'Staff'] });
    } else {
      // Other users can only see their own role
      return res.json({ roles: [req.user.role] });
    }
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Failed to fetch roles' });
  }
});

module.exports = router;

