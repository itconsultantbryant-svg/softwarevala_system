const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { authenticateToken } = require('../utils/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads/archived-documents');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'doc-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage, 
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
  fileFilter: (req, file, cb) => {
    // Allow all common document types including PowerPoint
    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.jpg', '.jpeg', '.png', '.gif', '.zip', '.rar'];
    const ext = path.extname(file.originalname).toLowerCase();
    const extMatch = allowedExtensions.includes(ext);
    
    // Also check MIME types for PowerPoint and other Office documents (browsers may send different MIME types)
    const allowedMimeTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'application/zip',
      'application/x-rar-compressed',
      'application/octet-stream' // Some browsers send this for Office documents
    ];
    
    // Check if mimetype matches any allowed type (exact match or starts with image/ for images)
    const mimeMatch = allowedMimeTypes.some(mime => {
      if (file.mimetype === mime) return true;
      // Allow image/* types
      if (mime.startsWith('image/') && file.mimetype.startsWith('image/')) return true;
      return false;
    });
    
    // Accept if extension matches OR mimetype matches (more flexible)
    if (extMatch || mimeMatch) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Allowed types: PDF, Word, Excel, PowerPoint, Images, Archives (Max 100MB)'));
    }
  }
});

// Get all archived documents (users see their own, admin sees all)
router.get('/', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        ad.*,
        u.name as user_name,
        u.email as user_email,
        uploader.name as uploader_name
      FROM archived_documents ad
      LEFT JOIN users u ON ad.user_id = u.id
      LEFT JOIN users uploader ON ad.uploaded_by = uploader.id
      WHERE 1=1
    `;
    
    const params = [];
    
    // Non-admin users see:
    // 1. Documents assigned to them (user_id = their id)
    // 2. Documents they uploaded (uploaded_by = their id)
    // Use CAST so string/number id mismatch (e.g. SQLite vs PostgreSQL) doesn't hide rows
    if (req.user.role !== 'Admin') {
      const userId = req.user.id;
      const userIdNum = parseInt(userId, 10);
      query += ' AND (CAST(ad.user_id AS TEXT) = CAST(? AS TEXT) OR CAST(ad.uploaded_by AS TEXT) = CAST(? AS TEXT))';
      params.push(userIdNum, userIdNum);
    }
    
    query += ' ORDER BY ad.created_at DESC';
    
    const documents = await db.all(query, params);
    res.json({ documents });
  } catch (error) {
    console.error('Get archived documents error:', error);
    res.status(500).json({ error: 'Failed to fetch archived documents: ' + error.message });
  }
});

// Get single document
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT 
        ad.*,
        u.name as user_name,
        u.email as user_email,
        uploader.name as uploader_name
      FROM archived_documents ad
      LEFT JOIN users u ON ad.user_id = u.id
      LEFT JOIN users uploader ON ad.uploaded_by = uploader.id
      WHERE ad.id = ?
    `;
    
    const params = [req.params.id];
    
    // Non-admin users can see documents assigned to them or uploaded by them
    // Use CAST so string/number id mismatch doesn't hide documents
    if (req.user.role !== 'Admin') {
      const userIdNum = parseInt(req.user.id, 10);
      query += ' AND (CAST(ad.user_id AS TEXT) = CAST(? AS TEXT) OR CAST(ad.uploaded_by AS TEXT) = CAST(? AS TEXT))';
      params.push(userIdNum, userIdNum);
    }
    
    const document = await db.get(query, params);
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    res.json({ document });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({ error: 'Failed to fetch document: ' + error.message });
  }
});

// Upload document
router.post('/', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { file_name, description, source_type, source_id, target_user_id } = req.body;

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!file_name) {
      return res.status(400).json({ error: 'File name is required' });
    }

    // Determine user_id - admin can upload for other users
    let userId = req.user.id;
    if (req.user.role === 'Admin' && target_user_id) {
      userId = parseInt(target_user_id);
    }

    // Get user info
    const user = await db.get('SELECT name FROM users WHERE id = ?', [req.user.id]);
    const uploaded_by_name = user?.name || req.user.name || req.user.email;

    const filePath = `/uploads/archived-documents/${req.file.filename}`;
    const fileSize = req.file.size;
    const fileType = path.extname(req.file.originalname).toLowerCase();

    const result = await db.run(`
      INSERT INTO archived_documents (
        user_id, file_name, original_file_name, file_path, file_type, file_size,
        source_type, source_id, description, uploaded_by, uploaded_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId, file_name, req.file.originalname, filePath, fileType, fileSize,
      source_type || 'manual', source_id || null, description || null,
      req.user.id, uploaded_by_name
    ]);

    // Get document with user info for real-time update
    const newDocument = await db.get(`
      SELECT 
        ad.*,
        u.name as user_name,
        u.email as user_email,
        uploader.name as uploader_name
      FROM archived_documents ad
      LEFT JOIN users u ON ad.user_id = u.id
      LEFT JOIN users uploader ON ad.uploaded_by = uploader.id
      WHERE ad.id = ?
    `, [result.lastID]);
    
    // Emit real-time update for admin users
    if (global.io) {
      global.io.emit('document_uploaded', {
        document_id: newDocument.id,
        user_id: newDocument.user_id,
        file_name: newDocument.file_name,
        source_type: newDocument.source_type,
        uploaded_by: newDocument.uploaded_by
      });
    }
    
    res.status(201).json({ 
      message: 'Document uploaded successfully',
      document: newDocument 
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Failed to upload document: ' + error.message });
  }
});

// Delete document
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const document = await db.get('SELECT * FROM archived_documents WHERE id = ?', [req.params.id]);
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Only owner or admin can delete (compare as numbers to avoid string/id mismatch)
    const docUserId = parseInt(document.user_id, 10);
    const docUploadedBy = parseInt(document.uploaded_by, 10);
    const reqUserId = parseInt(req.user.id, 10);
    if (docUserId !== reqUserId && docUploadedBy !== reqUserId && req.user.role !== 'Admin') {
      return res.status(403).json({ error: 'You can only delete your own documents' });
    }

    // Delete file
    if (document.file_path) {
      const filePath = path.join(__dirname, '../..', document.file_path);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }

    await db.run('DELETE FROM archived_documents WHERE id = ?', [req.params.id]);
    
    // Emit real-time update for admin users
    if (global.io) {
      global.io.emit('document_deleted', {
        document_id: req.params.id,
        user_id: document.user_id
      });
    }
    
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Failed to delete document: ' + error.message });
  }
});

// Helper function to archive a document from system activity
async function archiveDocumentFromActivity(userId, filePath, originalFileName, sourceType, sourceId, description, uploadedBy) {
  try {
    const fileStats = fs.statSync(path.join(__dirname, '../..', filePath));
    const fileType = path.extname(originalFileName).toLowerCase();
    
    const user = await db.get('SELECT name FROM users WHERE id = ?', [uploadedBy]);
    const uploaded_by_name = user?.name || 'System';

    const result = await db.run(`
      INSERT INTO archived_documents (
        user_id, file_name, original_file_name, file_path, file_type, file_size,
        source_type, source_id, description, uploaded_by, uploaded_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      userId,
      originalFileName,
      originalFileName,
      filePath,
      fileType,
      fileStats.size,
      sourceType,
      sourceId,
      description || null,
      uploadedBy,
      uploaded_by_name
    ]);

    // Emit real-time update when document is archived automatically
    if (global.io && result.lastID) {
      global.io.emit('document_uploaded', {
        document_id: result.lastID,
        user_id: userId,
        file_name: originalFileName,
        source_type: sourceType,
        uploaded_by: uploadedBy
      });
    }
  } catch (error) {
    console.error('Error archiving document from activity:', error);
    // Don't throw - this is a background operation
  }
}

module.exports = { router, archiveDocumentFromActivity };

