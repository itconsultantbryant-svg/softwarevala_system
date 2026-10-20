const fs = require('fs');

/**
 * Best-effort directory creation for uploads. Neon Functions has no persistent
 * disk, so a missing/unwritable upload path must not crash module loading.
 */
function ensureUploadDir(dir) {
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  } catch (err) {
    console.warn(`Upload directory unavailable (${dir}):`, err.message);
  }
  return dir;
}

module.exports = ensureUploadDir;
