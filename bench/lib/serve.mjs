// A static server for build output, with the SPA fallback every router app needs.

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
  '.json': 'application/json',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

export async function serveStatic(dir) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    let file = path.join(dir, decodeURIComponent(url.pathname));
    if (!file.startsWith(dir) || !existsSync(file) || (await fs.stat(file)).isDirectory()) {
      file = path.join(dir, 'index.html');
    }
    res.writeHead(200, {'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream'});
    res.end(await fs.readFile(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {url: `http://127.0.0.1:${server.address().port}/`, close: () => new Promise((r) => server.close(r))};
}
