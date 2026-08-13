/*
 * Server statico minimale per il prototipo web. Nessuna dipendenza npm.
 *
 * Uso:  node tools/serve.js [porta]
 * Poi:  http://localhost:8080
 *
 * Supporta le Range request: servono ai PMTiles, che nella prossima fase
 * sostituiranno i GeoJSON. E' anche il comportamento che dovremo replicare
 * lato Kotlin dentro la WebView.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'web');
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.geojson': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.pmtiles': 'application/octet-stream',
  '.map': 'application/json; charset=utf-8',
};

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(req.url.split('?')[0]);
    const rel = urlPath === '/' ? 'index.html' : urlPath.replace(/^\/+/, '');
    const file = path.join(ROOT, rel);

    // niente path traversal fuori da web/
    if (!file.startsWith(ROOT)) {
      res.writeHead(403).end('403');
      return;
    }

    fs.stat(file, (err, stat) => {
      if (err || !stat.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 ' + rel);
        return;
      }

      const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
      const range = req.headers.range;

      if (range) {
        const m = /bytes=(\d*)-(\d*)/.exec(range);
        if (m) {
          const start = m[1] ? Number(m[1]) : 0;
          const end = m[2] ? Number(m[2]) : stat.size - 1;
          if (start >= stat.size || end >= stat.size || start > end) {
            res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }).end();
            return;
          }
          res.writeHead(206, {
            'Content-Type': type,
            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': end - start + 1,
            'Cache-Control': 'no-cache',
          });
          fs.createReadStream(file, { start, end }).pipe(res);
          return;
        }
      }

      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': stat.size,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'no-cache',
      });
      fs.createReadStream(file).pipe(res);
    });
  })
  .listen(PORT, () => {
    console.log(`prototipo su http://localhost:${PORT}`);
  });
