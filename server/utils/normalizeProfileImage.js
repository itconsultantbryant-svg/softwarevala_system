const normalizeProfileImage = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('data:image/')) {
    return trimmed;
  }

  const uploadsIndex = trimmed.indexOf('/uploads/');
  if (uploadsIndex !== -1) {
    return trimmed.slice(uploadsIndex);
  }

  try {
    const url = new URL(trimmed);
    if (url.pathname && url.pathname.includes('/uploads/')) {
      return url.pathname;
    }
    return trimmed;
  } catch (_err) {
    return trimmed;
  }
};

module.exports = { normalizeProfileImage };
