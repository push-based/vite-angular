// A static server for build output, with the SPA fallback every router app needs, and an
// optional proxy for the paths a real app's stub API answers (Ghostfolio's /api and /assets).

import {existsSync} from 'node:fs';
import * as fs from 'node:fs/promises';
import * as http from 'node:http';
import * as path from 'node:path';

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

/**
 * Serves `dir`. With `base` (like `/en/`), the app sits under that path, as a localized build
 * does. `proxy` is a list of path prefixes and the origin that answers them.
 */
export async function serveStatic(dir, {base = '/', proxy = []} = {}) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    const hit = proxy.find((p) => url.pathname === p.path || url.pathname.startsWith(p.path.endsWith('/') ? p.path : p.path + '/'));
    if (hit) {
      try {
        const upstream = await fetch(hit.target + url.pathname + url.search, {headers: {accept: req.headers.accept ?? '*/*'}});
        res.writeHead(upstream.status, {'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream'});
        res.end(Buffer.from(await upstream.arrayBuffer()));
      } catch (e) {
        res.writeHead(502);
        res.end(String(e));
      }
      return;
    }
    let rel = url.pathname.startsWith(base) ? url.pathname.slice(base.length) : url.pathname.replace(/^\//, '');
    let file = path.join(dir, decodeURIComponent(rel));
    if (!file.startsWith(dir) || !existsSync(file) || (await fs.stat(file)).isDirectory()) {
      file = path.join(dir, 'index.html');
    }
    if (process.env['BENCH_SERVE_DEBUG']) console.log(`serve: ${req.method} ${req.url} -> ${path.relative(dir, file)}`);
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream'});
    res.end(await fs.readFile(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {url: `http://127.0.0.1:${server.address().port}${base}`, close: () => new Promise((r) => server.close(r))};
}
