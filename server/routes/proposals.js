const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { createNotification, sendNotificationToRole } = require('../utils/notifications');
const { getUploadsRoot } = require('../utils/uploadsRoot');
const { archiveDocumentFromActivity } = require('./archivedDocuments');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(getUploadsRoot(), 'proposals');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'proposal-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, Word, Excel, PowerPoint, Text'));
    }
  }
});

// Helper function to check if user is Marketing Department Head
async function isMarketingDepartmentHead(user) {
  if (user.role === 'DepartmentHead') {
    const dept = await db.get(
      'SELECT name FROM departments WHERE manager_id = ? OR LOWER(TRIM(head_email)) = ?',
      [user.id, user.email.toLowerCase().trim()]
    );
    return dept && dept.name.toLowerCase().includes('marketing');
  }
  return false;
}

// Get all proposals
router.get('/', authenticateToken, async (req, res) => {
  try {
    const proposals = await db.all(`
      SELECT 
        p.*,
        cu.email as client_email,
        u.name as creator_name,
        u.email as creator_email,
        m.name as marketing_reviewer_name,
        a.name as admin_reviewer_name
      FROM proposals p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users m ON p.marketing_reviewed_by = m.id
      LEFT JOIN users a ON p.admin_reviewed_by = a.id
      ORDER BY p.proposal_date DESC, p.created_at DESC
    `);
    
    res.json({ proposals });
  } catch (error) {
    console.error('Get proposals error:', error);
    res.status(500).json({ error: 'Failed to fetch proposals: ' + error.message });
  }
});

// Get single proposal
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const proposal = await db.get(`
      SELECT 
        p.*,
        cu.email as client_email,
        u.name as creator_name,
        u.email as creator_email,
        m.name as marketing_reviewer_name,
        a.name as admin_reviewer_name
      FROM proposals p
      LEFT JOIN clients c ON p.client_id = c.id
      LEFT JOIN users cu ON c.user_id = cu.id
      LEFT JOIN users u ON p.created_by = u.id
      LEFT JOIN users m ON p.marketing_reviewed_by = m.id
      LEFT JOIN users a ON p.admin_reviewed_by = a.id
      WHERE p.id = ?
    `, [req.params.id]);
    
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }
    
    res.json({ proposal });
  } catch (error) {
    console.error('Get proposal error:', error);
    res.status(500).json({ error: 'Failed to fetch proposal: ' + error.message });
  }
});

// Create proposal
router.post('/', authenticateToken, upload.single('document'), async (req, res) => {
  try {
    const { client_id, client_name, proposal_date } = req.body;

    // Validation
    if (!client_name || !proposal_date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get user info
    const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const created_by_name = user?.name || req.user.name || req.user.email;

    // Auto-create client if client_id is not provided but client_name is
    let finalClientId = client_id;
    if (!client_id && client_name) {
      try {
        // Generate a temporary email for the client
        const tempEmail = `${client_name.toLowerCase().replace(/[^a-z0-9]/g, '.')}@client.prinstinegroup.org`;
        
        // Check if client already exists by name
        const existingClientByName = await db.get(`
          SELECT c.id 
          FROM clients c
          LEFT JOIN users u ON c.user_id = u.id
          WHERE u.name = ? OR c.company_name = ?
          LIMIT 1
        `, [client_name, client_name]);
        
        if (existingClientByName) {
          finalClientId = existingClientByName.id;
        } else {
          // Create new client - generate client ID
          const crypto = require('crypto');
          const generateClientId = () => {
            return 'CLT-' + Date.now().toString().slice(-8) + '-' + crypto.randomBytes(2).toString('hex').toUpperCase();
          };
          const clientId = generateClientId();
          
          // Check if user exists
          let userId = null;
          const existingUser = await db.get('SELECT id FROM users WHERE email = ?', [tempEmail]);
          
          if (!existingUser) {
            const { hashPassword } = require('../utils/auth');
            const passwordHash = await hashPassword('Client@123');
            const userResult = await db.run(
              `INSERT INTO users (email, username, password_hash, role, name, is_active, email_verified)
               VALUES (?, ?, ?, ?, ?, 1, 1)`,
              [tempEmail, tempEmail.split('@')[0], passwordHash, 'Client', client_name]
            );
            userId = userResult.lastID;
          } else {
            userId = existingUser.id;
          }
          
          // Check columns in clients table
          const clientsTableInfo = await db.all("PRAGMA table_info(clients)");
          const clientsColumnNames = clientsTableInfo.map(col => col.name);
          const hasCategory = clientsColumnNames.includes('category');
          const hasProgressStatus = clientsColumnNames.includes('progress_status');
          const hasCreatedBy = clientsColumnNames.includes('created_by');
          
          let insertColumns = ['user_id', 'client_id', 'company_name', 'status'];
          let insertValues = [userId, clientId, client_name, 'Active'];
          
          if (hasCategory) {
            insertColumns.push('category');
            insertValues.push('others');
          }
          if (hasProgressStatus) {
            insertColumns.push('progress_status');
            insertValues.push('pipeline client');
          }
          if (hasCreatedBy) {
            insertColumns.push('created_by');
            insertValues.push(req.user.id);
          }
          
          const placeholders = insertColumns.map(() => '?').join(', ');
          const clientResult = await db.run(
            `INSERT INTO clients (${insertColumns.join(', ')})
             VALUES (${placeholders})`,
            insertValues
          );
          
          finalClientId = clientResult.lastID;
          
          // Emit client_created event
          if (global.io) {
            global.io.emit('client_created', {
              id: finalClientId,
              client_id: clientId,
              name: client_name,
              company_name: client_name,
              email: tempEmail,
              status: 'Active',
              created_by: req.user.id,
              created_by_name: created_by_name
            });
          }
        }
      } catch (clientError) {
        console.error('Error auto-creating client from proposal:', clientError);
        // Continue without client_id if creation fails
      }
    }

    // Determine initial status
    // If created by Admin, status is Pending_Admin (admin approves their own)
    // Otherwise, status is Pending_Marketing
    const initialStatus = req.user.role === 'Admin' ? 'Pending_Admin' : 'Pending_Marketing';

    const document_path = req.file ? `/uploads/proposals/${req.file.filename}` : null;
    const document_name = req.file ? req.file.originalname : null;

    const result = await db.run(`
      INSERT INTO proposals (
        client_id, client_name, proposal_date, document_path, document_name,
        status, created_by, created_by_name
      )       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      finalClientId || null, client_name, proposal_date, document_path, document_name,
      initialStatus, req.user.id, created_by_name
    ]);

    const newProposal = await db.get('SELECT * FROM proposals WHERE id = ?', [result.lastID]);

    // Archive the document
    if (document_path) {
      await archiveDocumentFromActivity(
        req.user.id,
        document_path,
        document_name,
        'proposal',
        newProposal.id,
        `Proposal document for ${client_name}`,
        req.user.id
      );
    }

    // Send real-time notifications
    try {
      // Notify creator
      await sendNotificationToUser(req.user.id, {
        title: 'Proposal Submitted',
        message: `Your proposal for ${client_name} has been submitted successfully`,
        link: `/proposals/${newProposal.id}`,
        type: 'success',
        senderId: req.user.id
      });

      // Send notification to Marketing Manager if not created by Admin
      if (req.user.role !== 'Admin') {
        await sendNotificationToRole('DepartmentHead', {
          title: 'New Proposal Submitted',
          message: `A new proposal for ${client_name} has been submitted and requires your review.`,
          link: `/proposals/${newProposal.id}`,
          type: 'info',
          senderId: req.user.id
        });
      } else {
        // Admin created - notify other admins
        await sendNotificationToRole('Admin', {
          title: 'New Proposal Submitted',
          message: `A new proposal for ${client_name} has been submitted.`,
          link: `/proposals/${newProposal.id}`,
          type: 'info',
          senderId: req.user.id
        });
      }
    } catch (notifError) {
      console.error('Error sending notifications:', notifError);
    }
    
    res.status(201).json({ 
      message: 'Proposal created successfully',
      proposal: newProposal 
    });
  } catch (error) {
    console.error('Create proposal error:', error);
    res.status(500).json({ error: 'Failed to create proposal' });
  }
});

// Marketing Manager review
router.put('/:id/marketing-review', authenticateToken, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['Marketing_Approved', 'Marketing_Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Check if user is Marketing Department Head
    const isMarketing = await isMarketingDepartmentHead(req.user);
    if (!isMarketing && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only Marketing Department Head can review proposals' });
    }

    const proposal = await db.get('SELECT * FROM proposals WHERE id = ?', [req.params.id]);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    if (proposal.status !== 'Pending_Marketing') {
      return res.status(400).json({ error: 'Proposal is not pending marketing review' });
    }

    const nextStatus = status === 'Marketing_Approved' ? 'Pending_Admin' : 'Rejected';

    await db.run(`
      UPDATE proposals SET
        status = ?,
        marketing_reviewed_by = ?,
        marketing_reviewed_at = CURRENT_TIMESTAMP,
        marketing_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [nextStatus, req.user.id, notes || null, req.params.id]);

    const updated = await db.get('SELECT * FROM proposals WHERE id = ?', [req.params.id]);

    // Send real-time notifications
    try {
      const creator = await db.get('SELECT id, name FROM users WHERE id = ?', [proposal.created_by]);
      const isApproved = status === 'Marketing_Approved';
      
      // Notify creator
      if (creator) {
        await sendNotificationToUser(creator.id, {
          title: `Proposal ${isApproved ? 'Approved' : 'Rejected'}`,
          message: `Your proposal for ${proposal.client_name} has been ${isApproved ? 'approved' : 'rejected'} by Marketing Manager`,
          link: `/proposals/${proposal.id}`,
          type: isApproved ? 'success' : 'warning',
          senderId: req.user.id
        });
      }

      // Notify admin if approved
      if (isApproved) {
        await sendNotificationToRole('Admin', {
          title: 'Proposal Approved by Marketing',
          message: `Proposal for ${proposal.client_name} has been approved by Marketing and requires your review.`,
          link: `/proposals/${proposal.id}`,
          type: 'info',
          senderId: req.user.id
        });
      }
    } catch (notifError) {
      console.error('Error sending notifications:', notifError);
    }

    res.json({ 
      message: 'Proposal reviewed successfully',
      proposal: updated 
    });
  } catch (error) {
    console.error('Marketing review error:', error);
    res.status(500).json({ error: 'Failed to review proposal' });
  }
});

// Admin review
router.put('/:id/admin-review', authenticateToken, async (req, res) => {
  try {
    const { status, notes } = req.body;

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    // Only Admin can review
    if (req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'Only Admin can perform final review' });
    }

    const proposal = await db.get('SELECT * FROM proposals WHERE id = ?', [req.params.id]);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Admin can approve their own proposals directly, or proposals that have been approved by Marketing
    if (proposal.status !== 'Pending_Admin' && !(proposal.status === 'Pending_Marketing' && proposal.created_by === req.user.id)) {
      return res.status(400).json({ error: 'Proposal is not pending admin review' });
    }

    await db.run(`
      UPDATE proposals SET
        status = ?,
        admin_reviewed_by = ?,
        admin_reviewed_at = CURRENT_TIMESTAMP,
        admin_notes = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [status, req.user.id, notes || null, req.params.id]);

    const updated = await db.get('SELECT * FROM proposals WHERE id = ?', [req.params.id]);

    // Send real-time notifications
    try {
      const creator = await db.get('SELECT id, name FROM users WHERE id = ?', [proposal.created_by]);
      const isApproved = status === 'Approved';
      
      // Notify creator
      if (creator) {
        await sendNotificationToUser(creator.id, {
          title: `Proposal ${isApproved ? 'Approved' : 'Rejected'}`,
          message: `Your proposal for ${proposal.client_name} has been ${isApproved ? 'approved' : 'rejected'} by Admin`,
          link: `/proposals/${req.params.id}`,
          type: isApproved ? 'success' : 'warning',
          senderId: req.user.id
        });
      }

      // If Marketing Manager reviewed it, notify them too
      if (proposal.marketing_reviewed_by) {
        await sendNotificationToUser(proposal.marketing_reviewed_by, {
          title: `Proposal ${isApproved ? 'Approved' : 'Rejected'}`,
          message: `The proposal for ${proposal.client_name} you reviewed has been ${isApproved ? 'approved' : 'rejected'} by Admin`,
          link: `/proposals/${req.params.id}`,
          type: isApproved ? 'success' : 'info',
          senderId: req.user.id
        });
      }
    } catch (notifError) {
      console.error('Error sending notifications:', notifError);
    }

    res.json({ 
      message: 'Proposal reviewed successfully',
      proposal: updated 
    });
  } catch (error) {
    console.error('Admin review error:', error);
    res.status(500).json({ error: 'Failed to review proposal' });
  }
});

// Delete proposal
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const proposal = await db.get('SELECT * FROM proposals WHERE id = ?', [req.params.id]);
    if (!proposal) {
      return res.status(404).json({ error: 'Proposal not found' });
    }

    // Only creator or admin can delete
    if (proposal.created_by !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'You can only delete your own proposals' });
    }

    // Delete file if exists
    if (proposal.document_path) {
      const filePath = path.join(__dirname, '../..', proposal.document_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.run('DELETE FROM proposals WHERE id = ?', [req.params.id]);
    
    res.json({ message: 'Proposal deleted successfully' });
  } catch (error) {
    console.error('Delete proposal error:', error);
    res.status(500).json({ error: 'Failed to delete proposal' });
  }
});

module.exports = router;

