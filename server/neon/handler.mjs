import http from 'node:http';
import net from 'node:net';
import { Readable } from 'node:stream';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  server,
  initializeDatabase,
  syncApprovedProgressReportsToTargets
} = require('./server.cjs');

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'expect'
]);

let readyPromise;
let internalPort;

function startInternalServer() {
  return new Promise((resolve, reject) => {
    if (server.listening) {
      resolve(server.address().port);
      return;
    }
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(0, '127.0.0.1');
  });
}

function ensureReady() {
  if (!readyPromise) {
    readyPromise = (async () => {
      await initializeDatabase();
      await syncApprovedProgressReportsToTargets();
      internalPort = await startInternalServer();
      console.log(`Neon Function internal API listening on 127.0.0.1:${internalPort}`);
      return internalPort;
    })().catch((err) => {
      readyPromise = null;
      throw err;
    });
  }
  return readyPromise;
}

function buildUpstreamHeaders(request, url) {
  const headers = {};
  for (const [key, value] of request.headers) {
    if (!HOP_BY_HOP.has(key.toLowerCase())) {
      headers[key] = value;
    }
  }
  const originalHost = request.headers.get('host');
  if (originalHost) headers.host = originalHost;
  headers['x-forwarded-proto'] = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
  headers['x-forwarded-host'] = request.headers.get('x-forwarded-host') || originalHost || url.host;
  headers['x-forwarded-for'] = request.headers.get('x-forwarded-for')
    || request.headers.get('cf-connecting-ip')
    || '127.0.0.1';
  return headers;
}

async function proxyFetch(request) {
  const port = await ensureReady();
  const url = new URL(request.url);
  const headers = buildUpstreamHeaders(request, url);

  return new Promise((resolve, reject) => {
    const upstream = http.request({
      host: '127.0.0.1',
      port,
      method: request.method,
      path: `${url.pathname}${url.search}`,
      headers
    }, (res) => {
      const responseHeaders = new Headers();
      for (const [key, value] of Object.entries(res.headers)) {
        if (value === undefined) continue;
        if (key.toLowerCase() === 'set-cookie') {
          for (const cookie of [].concat(value)) {
            responseHeaders.append('set-cookie', cookie);
          }
        } else if (Array.isArray(value)) {
          responseHeaders.set(key, value.join(', '));
        } else {
          responseHeaders.set(key, String(value));
        }
      }

      const status = res.statusCode || 502;
      if (status === 204 || status === 304) {
        res.resume();
        resolve(new Response(null, { status, headers: responseHeaders }));
        return;
      }
      resolve(new Response(Readable.toWeb(res), { status, headers: responseHeaders }));
    });

    upstream.setTimeout(120000, () => upstream.destroy(new Error('Upstream request timed out')));
    upstream.on('error', reject);

    if (!request.body) {
      upstream.end();
      return;
    }

    (async () => {
      const reader = request.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!upstream.write(Buffer.from(value))) {
            await new Promise((resolveDrain) => upstream.once('drain', resolveDrain));
          }
        }
        upstream.end();
      } catch (err) {
        upstream.destroy(err);
      }
    })();
  });
}

async function proxyUpgrade(req, socket, head) {
  const port = await ensureReady();
  const upstream = net.connect(port, '127.0.0.1', () => {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
      lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    }
    upstream.write(`${lines.join('\r\n')}\r\n\r\n`);
    if (head && head.length) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on('error', () => socket.destroy());
  socket.on('error', () => upstream.destroy());
}

export default {
  fetch: proxyFetch,
  upgrade: proxyUpgrade
};
