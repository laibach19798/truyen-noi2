// Tự host: `npm run build && npm run serve` — phục vụ bản build + /api/proxy.
const http = require('http');
const fs = require('fs');
const path = require('path');
const proxy = require('./api/proxy');
const search = require('./api/search');

const PORT = process.env.PORT || 3000;
const BUILD = path.join(__dirname, 'build');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain', '.map': 'application/json',
};

http.createServer((req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/api/proxy') return proxy(req, res);
  if (pathname === '/api/search') return search(req, res);
  let file = path.normalize(path.join(BUILD, decodeURIComponent(pathname)));
  if (!file.startsWith(BUILD) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(BUILD, 'index.html');
  }
  res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
}).listen(PORT, () => console.log(`Truyện Nói chạy tại http://localhost:${PORT}`));
