'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const root = __dirname;
const port = Number(process.env.PORT || 5173);

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function send(res, status, body, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
  });
  res.end(body);
}

function resolveRequest(urlPath) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(urlPath, `http://localhost:${port}`).pathname);
  } catch (_) {
    pathname = '/';
  }

  if (pathname === '/' || pathname === '/Noesis' || pathname === '/Noesis/') {
    return path.join(root, 'Noesis', 'index.html');
  }
  if (pathname === '/favicon.ico') {
    return path.join(root, 'assets', 'noesis_primary_logo.png');
  }

  const normalized = path.normalize(pathname).replace(/^([/\\])+/, '');
  const filePath = path.join(root, normalized);
  if (!filePath.startsWith(root)) return null;
  return filePath;
}

const server = http.createServer((req, res) => {
  const filePath = resolveRequest(req.url);
  if (!filePath) return send(res, 400, 'Bad request');

  fs.stat(filePath, (statErr, stat) => {
    if (statErr || !stat.isFile()) return send(res, 404, 'File not found');

    const contentType = types[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    fs.readFile(filePath, (readErr, data) => {
      if (readErr) return send(res, 500, 'Could not read file');
      send(res, 200, data, contentType);
    });
  });
});

server.listen(port, () => {
  console.log(`Noesis frontend listening on http://localhost:${port}/Noesis`);
});
