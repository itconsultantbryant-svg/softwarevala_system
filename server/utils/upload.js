const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure upload directories exist (no-op warning on stateless hosts)
const ensureUploadDir = require('./ensureUploadDir');
const { getUploadsRoot } = require('./uploadsRoot');
const profileImagesDir = ensureUploadDir(path.join(getUploadsRoot(), 'profile-images'));
const uploadsDir = ensureUploadDir(getUploadsRoot());

// Configure storage for profile images - stored permanently in dedicated directory
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, profileImagesDir);
  },
  filename: (req, file, cb) => {
    // Use user ID in filename for better organization and to identify user's old images
    const userId = req.user?.id || 'unknown';
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `profile-${userId}-${uniqueSuffix}${ext}`);
  }
});

// File filter
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp)'));
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: fileFilter
});

module.exports = upload;

