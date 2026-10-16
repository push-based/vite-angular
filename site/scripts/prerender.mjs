// Renders every route of the built site to static HTML, for GitHub Pages.
// Run after `vite build`, which with the plugin's `ssr` option writes dist/client (browser) and dist/server (server entry).

import {mkdir, readFile, writeFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(site, 'dist/client');
const base = process.env.SITE_BASE ?? '/vite-angular/';

const template = await readFile(path.join(client, 'index.html'), 'utf8');
const {default: render, routes} = await import(pathToFileURL(path.join(site, 'dist/server/main.server.js')).href);

const pages = [...routes.map((route) => ({route, file: path.join(route, 'index.html')})), {route: '404', file: '404.html'}];

for (const {route, file} of pages) {
  const started = performance.now();
  const html = await render(`http://localhost${base}${route}`, template);
  const out = path.join(client, file);
  await mkdir(path.dirname(out), {recursive: true});
  await writeFile(out, html);
  console.log(`prerendered ${base}${route} → dist/client/${file} (${Math.round(performance.now() - started)} ms)`);
}

// GitHub Pages runs Jekyll unless this file exists, and Jekyll hides files that start with "_".
await writeFile(path.join(client, '.nojekyll'), '');
