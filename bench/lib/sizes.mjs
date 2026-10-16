// Bundle size of a build: every .js and .css file, and the initial part the browser loads before
// any lazy route, raw and gzipped.

import * as fs from 'node:fs';
import * as path from 'node:path';
import {gzipSync} from 'node:zlib';

const ASSET = /\.(m?js|css)$/;
// Static imports in minified ESM: `import{a}from"./x.js"`, `import"./x.js"`, `export*from"./x.js"`.
const STATIC_IMPORT = /(?:^|[\s;})])(?:import|export)\s*(?:[\w$*{}\s,]*?\s*from\s*)?["']([^"']+\.m?js)["']/g;

function files(dir) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), {withFileTypes: true})) {
      const child = path.posix.join(rel, e.name);
      if (e.isDirectory()) walk(child);
      else if (ASSET.test(e.name)) out.push(child);
    }
  };
  walk('');
  return out;
}

function measure(dir, list) {
  let raw = 0;
  let gzip = 0;
  for (const f of list) {
    const buf = fs.readFileSync(path.join(dir, f));
    raw += buf.length;
    gzip += gzipSync(buf, {level: 9}).length;
  }
  return {files: list.length, raw, gzip};
}

export function bundleSizes(dir) {
  const all = files(dir);
  const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
  const local = (ref) => ref.replace(/^\//, '').replace(/^\.\//, '');
  // What index.html loads: scripts, module preloads, stylesheets.
  const initial = new Set();
  for (const m of html.matchAll(/<(?:script|link)\b[^>]*?(?:src|href)="([^"]+)"[^>]*>/g)) {
    const tag = m[0];
    if (tag.startsWith('<link') && !/rel="(?:stylesheet|modulepreload)"/.test(tag)) continue;
    const f = local(m[1]);
    if (ASSET.test(f) && fs.existsSync(path.join(dir, f))) initial.add(f);
  }
  // Plus everything those scripts import statically.
  const queue = [...initial].filter((f) => /\.m?js$/.test(f));
  while (queue.length > 0) {
    const f = queue.shift();
    const code = fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of code.matchAll(STATIC_IMPORT)) {
      const dep = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1]));
      if (!initial.has(dep) && fs.existsSync(path.join(dir, dep))) {
        initial.add(dep);
        queue.push(dep);
      }
    }
  }
  const js = (list) => list.filter((f) => /\.m?js$/.test(f));
  const css = (list) => list.filter((f) => f.endsWith('.css'));
  return {
    total: {js: measure(dir, js(all)), css: measure(dir, css(all))},
    initial: {js: measure(dir, js([...initial])), css: measure(dir, css([...initial]))},
  };
}
