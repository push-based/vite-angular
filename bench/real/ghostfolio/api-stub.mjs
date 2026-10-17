// A stand-in for Ghostfolio's API, enough for the client to bootstrap and render its landing page
// without a database. main.ts fetches /api/v1/info before it calls bootstrapApplication, so with
// no API the app never starts under any tool. The answer here is a saved response from the public
// instance at ghostfol.io (info.json, with its demo token removed). /assets is served from the
// client's own assets folder, as the real API does. Anything else under /api answers 404 and is
// logged, so a page that needs more shows up as a failed gate, not a silent pass.
//
// Usage: node api-stub.mjs [port]   (default 3333, what apps/client/proxy.conf.json targets)

import * as fs from 'node:fs';
import * as http from 'node:http';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.argv[2] ?? 3333);
const info = fs.readFileSync(path.join(here, 'info.json'));
const assets = path.join(here, 'apps/client/src/assets');
const TYPES = {'.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.md': 'text/markdown'};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;
  if (p === '/api/v1/info') {
    res.writeHead(200, {'content-type': 'application/json'});
    return res.end(info);
  }
  // Nobody is signed in: the real API answers 401 here, and the client shows the public pages.
  if (p === '/api/v1/user') {
    res.writeHead(401, {'content-type': 'application/json'});
    return res.end('{"message":"Unauthorized","statusCode":401}');
  }
  if (/^\/api\/assets\/[^/]+\/site\.webmanifest$/.test(p)) {
    res.writeHead(200, {'content-type': 'application/manifest+json'});
    return res.end(JSON.stringify({name: 'Ghostfolio', short_name: 'Ghostfolio', start_url: '/', display: 'standalone', icons: []}));
  }
  if (p.startsWith('/assets/')) {
    const file = path.join(assets, decodeURIComponent(p.slice('/assets/'.length)));
    if (file.startsWith(assets) && fs.existsSync(file) && fs.statSync(file).isFile()) {
      res.writeHead(200, {'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream'});
      return res.end(fs.readFileSync(file));
    }
  }
  console.error(`api-stub: 404 ${req.method} ${p}`);
  res.writeHead(404, {'content-type': 'application/json'});
  res.end('{"statusCode":404}');
});
server.listen(port, '127.0.0.1', () => console.log(`api-stub listening on http://127.0.0.1:${port}`));
