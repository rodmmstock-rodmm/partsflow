import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

const port = Number(process.env.PORT || 10000);
const root = join(process.cwd(), 'frontend', 'dist');
const mime = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function sendFile(res, file) {
  res.statusCode = 200;
  res.setHeader('Content-Type', mime[extname(file).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', file.endsWith('index.html') ? 'no-store' : 'public, max-age=3600');
  createReadStream(file).pipe(res);
}

const server = http.createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = normalize(rawPath).replace(/^([.][.][/\\])+/, '').replace(/^[/\\]+/, '');
  const candidate = join(root, safePath || 'index.html');

  if (candidate.startsWith(root) && existsSync(candidate) && statSync(candidate).isFile()) {
    sendFile(res, candidate);
    return;
  }

  // React Router SPA fallback for /login, /orders, /history, etc.
  sendFile(res, join(root, 'index.html'));
});

server.listen(port, '0.0.0.0', () => {
  console.log(`PartsFlow Design Lab static server listening on 0.0.0.0:${port}`);
});
