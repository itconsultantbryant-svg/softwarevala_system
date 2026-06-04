/**
 * Consistent email normalization for account creation and login lookup.
 */
const validator = require('validator');

function normalizeAccountEmail(email) {
  if (email === null || email === undefined) return '';
  const raw = String(email).trim();
  if (!raw) return '';
  try {
    const normalized = validator.normalizeEmail(raw, {
      gmail_remove_dots: true,
      gmail_remove_subaddress: true,
      outlookdotcom_remove_subaddress: true,
      yahoo_remove_subaddress: true,
      icloud_remove_subaddress: true
    });
    if (normalized) return normalized.toLowerCase().trim();
  } catch (_e) {
    /* fall through */
  }
  return raw.toLowerCase().trim();
}

function loginLookupVariants(loginId) {
  const raw = String(loginId || '').trim();
  if (!raw) return [];
  const variants = new Set();
  variants.add(raw.toLowerCase());
  const normalized = normalizeAccountEmail(raw);
  if (normalized) variants.add(normalized);
  return [...variants];
}

const USER_LOGIN_COLUMNS = `
  id, email, username, password_hash, role, name, phone, profile_image, is_active, email_verified
`;

async function findUserByLoginId(db, loginId) {
  if (!loginId) return null;

  for (const variant of loginLookupVariants(loginId)) {
    const byEmail = await db.get(
      `SELECT ${USER_LOGIN_COLUMNS} FROM users WHERE LOWER(TRIM(email)) = ? LIMIT 1`,
      [variant]
    );
    if (byEmail) return byEmail;
  }

  const usernameKey = String(loginId).toLowerCase().trim();
  if (!usernameKey) return null;

  return db.get(
    `SELECT ${USER_LOGIN_COLUMNS} FROM users WHERE LOWER(TRIM(username)) = ? LIMIT 1`,
    [usernameKey]
  );
}

module.exports = {
  normalizeAccountEmail,
  loginLookupVariants,
  findUserByLoginId
};
