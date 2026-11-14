// Lightweight production server for the Docker image.
// - Serves the built SPA from ./dist (with SPA fallback, like vercel.json rewrites)
// - Mounts every Vercel-style handler in ./api/*.js at /api/<name>
// Zero dependencies on purpose: package.json is "type": "module",
// so this .cjs file can require() the CommonJS api handlers directly.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = Number(process.env.PORT || 3000);
const DIST = path.join(__dirname, 'dist');
const API_DIR = path.join(__dirname, 'api');

// Load /api/contact.js -> handler at /api/contact, etc.
const handlers = {};
for (const file of fs.readdirSync(API_DIR)) {
  if (file.endsWith('.js') || file.endsWith('.cjs')) {
    try {
      handlers[path.basename(file).replace(/\.c?js$/, '')] = require(path.join(API_DIR, file));
    } catch (err) {
      console.warn(`[server] skipping api/${file}: ${err.message}`);
    }
  }
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
  '.webmanifest': 'application/manifest+json',
};

function sendJson(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = decodeURIComponent(url.pathname);

    // ---- API routes (Vercel-style handlers) ----
    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5).replace(/\/+$/, '');
      const handler = handlers[name];
      if (typeof handler !== 'function') {
        return sendJson(res, 404, { error: `Unknown API endpoint: /api/${name}` });
      }

      // Parse JSON body so handlers can use req.body like on Vercel
      if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks).toString('utf8');
        try {
          req.body = raw ? JSON.parse(raw) : {};
        } catch {
          req.body = {};
        }
      }

      // Minimal express-like helpers the handlers rely on
      res.status = (code) => {
        res.statusCode = code;
        return res;
      };
      res.json = (obj) => sendJson(res, res.statusCode || 200, obj);

      return await handler(req, res);
    }

    // ---- Static files with SPA fallback ----
    let filePath = path.normalize(path.join(DIST, pathname));
    if (!filePath.startsWith(DIST)) {
      res.statusCode = 403;
      return res.end('Forbidden');
    }

    let stat = fs.existsSync(filePath) && fs.statSync(filePath);
    if (!stat || stat.isDirectory()) {
      // SPA fallback -> index.html (same as vercel.json rewrites)
      filePath = path.join(DIST, 'index.html');
      if (!fs.existsSync(filePath)) {
        res.statusCode = 404;
        return res.end('Not found: dist/ is missing. Did the build stage run?');
      }
    }

    const isAsset = pathname.startsWith('/assets/');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': isAsset ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('[server] error:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Internal Server Error' });
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log(`Onboarding 4U server listening on http://localhost:${PORT}`);
});
