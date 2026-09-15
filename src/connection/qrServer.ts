import http from 'http';
import fs from 'fs';
import path from 'path';

const QR_IMAGE_PATH = path.join(process.cwd(), 'qr.png');
const PORT = Number(process.env.PORT) || 3000;

/**
 * Serves the current WhatsApp login QR code as a real PNG image over
 * HTTP, so you can just open a URL in a browser instead of trying to
 * read mangled ASCII art in a log viewer.
 *
 * Routes:
 *   GET /          -> auto-refreshing HTML page showing the QR image
 *   GET /qr.png    -> the raw PNG (404 if no QR is currently pending)
 */
export function startQrServer() {
  const server = http.createServer((req, res) => {
    const url = req.url || '/';

    if (url.startsWith('/qr.png') || url.startsWith('/qr')) {
      if (fs.existsSync(QR_IMAGE_PATH)) {
        res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
        fs.createReadStream(QR_IMAGE_PATH).pipe(res);
      } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end(
          'No QR code available right now. Either the bot is already logged in, ' +
            'or it has not generated one yet — refresh in a few seconds.'
        );
      }
      return;
    }

    if (url === '/' || url.startsWith('/index.html')) {
      res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' });
      res.end(`<!doctype html>
<html>
  <head>
    <title>Syndicates — Scan QR</title>
    <meta http-equiv="refresh" content="5" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
  </head>
  <body style="font-family: sans-serif; text-align: center; padding: 40px;">
    <h2>Scan with WhatsApp</h2>
    <p>Settings → Linked Devices → Link a Device</p>
    <img
      src="/qr.png?ts=${Date.now()}"
      style="max-width: 320px; width: 100%;"
      onerror="this.replaceWith(document.createTextNode('No QR right now — page auto-refreshes.'))"
    />
    <p style="color:#888">This page refreshes every 5 seconds.</p>
  </body>
</html>`);
      return;
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Syndicates bot is running.');
  });

  server.listen(PORT, () => {
    console.log('');
    console.log('======================================');
    console.log(`   QR server listening on port ${PORT}`);
    console.log('   Open the app URL in a browser to scan.');
    console.log('======================================');
    console.log('');
  });

  return server;
}
