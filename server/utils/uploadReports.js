const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads/reports directory exists (no-op warning on stateless hosts)
const ensureUploadDir = require('./ensureUploadDir');
const { getUploadsRoot } = require('./uploadsRoot');
const reportsUploadsDir = ensureUploadDir(path.join(getUploadsRoot(), 'reports'));

// Configure storage for report attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, reportsUploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `report-${uniqueSuffix}${ext}`);
  }
});

// File filter - allow all common document and image types
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp|pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip|rar/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype) || 
                   file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
                   file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                   file.mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
                   file.mimetype === 'application/msword' ||
                   file.mimetype === 'application/vnd.ms-excel' ||
                   file.mimetype === 'application/vnd.ms-powerpoint';

  if (mimetype || extname) {
    return cb(null, true);
  } else {
    cb(new Error('File type not allowed. Allowed types: Images (JPEG, PNG, GIF, WEBP), Documents (PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, CSV, TXT), Archives (ZIP, RAR)'));
  }
};

// Configure multer for report attachments
const uploadReports = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

module.exports = uploadReports;

