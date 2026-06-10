/**
 * Repair certificate storage: migrate legacy DB blobs to disk and fix missing paths.
 */
const fs = require('fs');
const path = require('path');
const { getUploadsRoot } = require('./uploadsRoot');

function decodeDataUrlLocal(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.trim().match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) return null;
  try {
    return {
      mime: String(match[1] || 'application/octet-stream').toLowerCase(),
      buffer: Buffer.from(match[2], 'base64')
    };
  } catch (_e) {
    return null;
  }
}

async function repairCertificateFiles(db) {
  if (!db) return { migrated: 0, warned: 0 };

  const uploadDir = path.join(getUploadsRoot(), 'certificates');
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  let migrated = 0;
  let warned = 0;

  const blobRows = await db.all(
    `SELECT id, certificate_id, file_data_url, file_path, pdf_path
     FROM certificates
     WHERE file_data_url IS NOT NULL AND TRIM(file_data_url) != ''`
  );

  for (const row of blobRows || []) {
    const decoded = decodeDataUrlLocal(row.file_data_url);
    if (!decoded?.buffer?.length) {
      warned++;
      continue;
    }

    const ext =
      decoded.mime === 'application/pdf'
        ? '.pdf'
        : decoded.mime === 'image/png'
          ? '.png'
          : '.jpg';
    const filename = `certificate-repair-${row.id}-${Date.now()}${ext}`;
    const diskPath = path.join(uploadDir, filename);
    fs.writeFileSync(diskPath, decoded.buffer);
    const webPath = `/uploads/certificates/${filename}`;

    await db.run(
      `UPDATE certificates SET file_path = ?, pdf_path = ?, file_data_url = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [webPath, webPath, row.id]
    );
    migrated++;
    console.log(`[certificates] Repaired blob → disk: ${row.certificate_id || row.id}`);
  }

  const pathRows = await db.all(
    `SELECT id, certificate_id, file_path, pdf_path
     FROM certificates
     WHERE COALESCE(file_path, pdf_path) IS NOT NULL`
  );

  const { resolveCertificateAbsoluteDiskPath } = require('./certificateFileDelivery');
  for (const row of pathRows || []) {
    const abs = resolveCertificateAbsoluteDiskPath(row);
    if (!abs || !fs.existsSync(abs)) {
      warned++;
      console.warn(
        `[certificates] Missing file on disk for ${row.certificate_id || row.id}: ${row.file_path || row.pdf_path}`
      );
    }
  }

  if (migrated > 0 || warned > 0) {
    console.log(`[certificates] Storage repair: ${migrated} migrated to disk, ${warned} warning(s).`);
  }

  return { migrated, warned };
}

module.exports = { repairCertificateFiles };
