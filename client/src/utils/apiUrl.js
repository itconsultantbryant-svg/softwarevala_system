/**
 * Centralized API URL utility for production-ready URL handling.
 *
 * Render: set REACT_APP_API_URL to your backend HTTPS URL (with or without /api).
 * Socket.IO uses the same host (see getSocketBaseUrl); client prefers HTTP long-polling
 * before WebSocket so restrictive carriers (e.g. some Orange Liberia paths) still connect.
 * If DNS issues persist on one ISP, use a custom domain (Cloudflare) in front of Render.
 */

function trimTrailingSlashes(s) {
  return (s || '').replace(/\/+$/, '');
}

/**
 * Get the API base URL from environment variable
 * In production, REACT_APP_API_URL must be set (Render: full https URL to backend, with or without /api)
 * @returns {string} API base URL
 */
export const getApiBaseUrl = () => {
  const raw = (process.env.REACT_APP_API_URL || '').trim();

  if (!raw && process.env.NODE_ENV === 'production') {
    console.error('REACT_APP_API_URL is not set in production! Please configure it.');
    return '';
  }

  if (!raw) {
    return 'http://localhost:3006/api';
  }

  let base = trimTrailingSlashes(raw);
  if (!/\/api$/i.test(base)) {
    base = `${base}/api`;
  }
  return base;
};

/**
 * Socket.IO connects to the API host (no /api path). Override with REACT_APP_SOCKET_URL if needed.
 */
export const getSocketBaseUrl = () => {
  const socketUrl = (process.env.REACT_APP_SOCKET_URL || '').trim();
  if (socketUrl) return trimTrailingSlashes(socketUrl);
  return getBaseUrl();
};

/**
 * Get the base URL (without /api) for file serving
 * @returns {string} Base URL without /api
 */
export const getBaseUrl = () => {
  const apiUrl = getApiBaseUrl();
  if (!apiUrl) return '';
  
  // Remove /api suffix if present
  return apiUrl.replace(/\/api\/?$/, '');
};

/**
 * Normalize a relative URL to full URL
 * @param {string} relativeUrl - Relative URL path (e.g., /uploads/file.jpg)
 * @returns {string} Full URL
 */
export const normalizeUrl = (relativeUrl) => {
  if (!relativeUrl) return '';
  
  // If already a full URL, return as is
  if (relativeUrl.startsWith('http://') || relativeUrl.startsWith('https://')) {
    return relativeUrl;
  }

  // If data URL, return as is
  if (relativeUrl.startsWith('data:')) {
    return relativeUrl;
  }
  
  // Ensure relative URL starts with /
  const normalizedPath = relativeUrl.startsWith('/') ? relativeUrl : `/${relativeUrl}`;
  const baseUrl = getBaseUrl();
  
  if (!baseUrl) {
    console.error('Cannot normalize URL - base URL not available');
    return relativeUrl;
  }
  
  return `${baseUrl}${normalizedPath}`;
};

