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
  id, email, username, password_hash, role, name, phone, profile_image, is_active, email_verified, must_change_password, session_version, failed_login_attempts, lockout_until
`;

const LEGACY_USER_LOGIN_COLUMNS = `
  id, email, username, password_hash, role, name, phone, profile_image, is_active, email_verified
`;

function isMissingAuthSchema(error) {
  const message = String(error?.message || '').toLowerCase();
  return (
    /(?:no such column|column .* does not exist|undefined column)/i.test(message) &&
    /must_change_password|session_version|failed_login_attempts|lockout_until|last_login_at|last_login_ip/.test(message)
  );
}

async function getLoginUser(db, where, value) {
  try {
    return await db.get(`SELECT ${USER_LOGIN_COLUMNS} FROM users WHERE ${where} LIMIT 1`, [value]);
  } catch (error) {
    // Production deployments can temporarily be on the schema before migrations
    // 037/040. Existing accounts must remain able to sign in during that rollout.
    if (!isMissingAuthSchema(error)) throw error;
    const user = await db.get(`SELECT ${LEGACY_USER_LOGIN_COLUMNS} FROM users WHERE ${where} LIMIT 1`, [value]);
    return user ? { ...user, must_change_password: 0, session_version: 1, failed_login_attempts: 0, lockout_until: null } : null;
  }
}

async function findUserByLoginId(db, loginId) {
  if (!loginId) return null;

  for (const variant of loginLookupVariants(loginId)) {
    const byEmail = await getLoginUser(db, 'LOWER(TRIM(email)) = ?', variant);
    if (byEmail) return byEmail;
  }

  const usernameKey = String(loginId).toLowerCase().trim();
  if (!usernameKey) return null;

  return getLoginUser(db, 'LOWER(TRIM(username)) = ?', usernameKey);
}

module.exports = {
  normalizeAccountEmail,
  loginLookupVariants,
  findUserByLoginId,
  isMissingAuthSchema
};
