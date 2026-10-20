import { build } from 'esbuild';
import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(here, 'dist');

await mkdir(dist, { recursive: true });

await build({
  entryPoints: [path.join(here, '..', 'server.js')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node24',
  outfile: path.join(dist, 'server.cjs'),
  external: ['sqlite3'],
  logLevel: 'info'
});

await copyFile(path.join(here, 'handler.mjs'), path.join(dist, 'index.mjs'));

console.log('Neon Function bundle ready:', dist);
