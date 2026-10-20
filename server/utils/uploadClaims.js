const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists (no-op warning on stateless hosts)
const ensureUploadDir = require('./ensureUploadDir');
const { getUploadsRoot } = require('./uploadsRoot');
const uploadsDir = ensureUploadDir(path.join(getUploadsRoot(), 'claims'));

// Configure storage for claim attachments
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `claim-${uniqueSuffix}${ext}`);
  }
});

// File filter for claims - PNG, JPEG, PDF only
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|pdf/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = /image\/(jpeg|jpg|png)|application\/pdf/.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only PNG, JPEG, and PDF files are allowed'));
  }
};

// Configure multer for claims
const uploadClaims = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: fileFilter
});

module.exports = uploadClaims;

