#!/usr/bin/env node
/**
 * Local preview: builds the site, serves /dist on http://localhost:4321
 * and rebuilds whenever something in content/, public/ or src/ changes.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync, watch } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runBuild } from './build.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PORT || 4321);
const outDir = path.join(root, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.wasm': 'application/wasm',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

let building = Promise.resolve();
const rebuild = () => (building = building.then(() => runBuild({ dev: true }).catch((e) => console.error(e))));

await rebuild();

createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = path.join(outDir, pathname);
  if (!file.startsWith(outDir)) return res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': TYPES['.html'] });
    return createReadStream(path.join(outDir, '404.html')).pipe(res);
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'cache-control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`→ http://localhost:${port}/`));

let timer;
for (const dir of ['content', 'public', 'src']) {
  watch(path.join(root, dir), { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 250);
  });
}
