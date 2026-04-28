/**
 * Helpers for certificate file downloads using axios + blob responses.
 * Ensures JSON error bodies are surfaced when the server returns 4xx with responseType: 'blob'.
 */

function parseFilenameFromContentDisposition(header) {
  if (!header || typeof header !== 'string') return null;
  const utf8 = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8 && utf8[1]) {
    try {
      return decodeURIComponent(utf8[1].trim());
    } catch (_e) {
      return utf8[1].trim();
    }
  }
  const quoted = header.match(/filename="([^"]+)"/i);
  if (quoted && quoted[1]) return quoted[1].trim();
  const plain = header.match(/filename=([^;]+)/i);
  if (plain && plain[1]) return plain[1].replace(/"/g, '').trim();
  return null;
}

/**
 * Turn an axios response (with validateStatus: () => true) into a browser download.
 * @param {import('axios').AxiosResponse} response
 * @param {string} [fallbackBaseName] e.g. certificate-CERT-123
 */
export async function saveCertificateAxiosBlob(response, fallbackBaseName = 'certificate') {
  const contentType = (response.headers['content-type'] || response.headers['Content-Type'] || '').toLowerCase();

  if (response.status >= 400 || contentType.includes('application/json')) {
    let message = `Download failed (${response.status})`;
    try {
      const data = response.data;
      const text = typeof data?.text === 'function' ? await data.text() : String(data);
      const parsed = JSON.parse(text);
      if (parsed && parsed.error) message = parsed.error;
    } catch (_e) {
      // keep generic message
    }
    throw new Error(message);
  }

  const blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
  const nameFromHeader = parseFilenameFromContentDisposition(
    response.headers['content-disposition'] || response.headers['Content-Disposition']
  );
  const downloadName = nameFromHeader || `${fallbackBaseName}`;

  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', downloadName);
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
