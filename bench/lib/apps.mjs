// The apps the benchmark runs, and what the harness needs to know about each: where it lives,
// how to tell it rendered, and which files an edit touches.

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

export const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(BENCH, '..');
// .noindex keeps Spotlight from indexing 10,000 generated files while the benchmark runs.
export const APPS_DIR = path.join(BENCH, '.work/apps.noindex');
// Real open-source apps, set up by real.mjs. CI puts them somewhere with more disk.
export const REAL_DIR = path.resolve(process.env['REAL_DIR'] ?? path.join(BENCH, '.work/real.noindex'));

export const GENERATED_SIZES = [100, 1000, 5000];

/** @returns {{id: string, dir: string, kind: 'generated'|'playground'|'real', ...}} */
export function loadApp(id) {
  const real = path.join(REAL_DIR, id, 'bench.json');
  if (fs.existsSync(real)) return loadRealApp(id, real);
  const dir = path.join(APPS_DIR, id);
  if (!fs.existsSync(dir)) {
    if (fs.existsSync(path.join(BENCH, 'real', `${id}.json`))) throw new Error(`${id} isn't set up: run \`node real.mjs ${id}\` first`);
    throw new Error(`${id} isn't set up: run \`node apps.mjs\` first`);
  }
  if (id === 'playground') {
    return {
      id,
      label: 'playground',
      dir,
      kind: 'playground',
      components: 21,
      sourceDirs: ['src'],
      rootTag: '<app-root',
      // The overview page renders its hero heading and the pipeline list.
      gate: `() => !!document.querySelector('app-root h1')?.textContent.includes('one module at a time')
        && document.querySelectorAll('app-root ol.pipeline li').length === 4`,
      // A build must also render a lazy route.
      lazy: {path: 'signals', gate: `() => !!document.querySelector('app-root app-signals app-page-header h1')`},
      template: 'src/app/pages/overview/overview.html',
      ts: {
        file: 'src/app/pages/overview/overview.ts',
        find: '$localize`Only what the browser imports, when it imports it.`',
      },
      // `ng serve` can't run it: it reads import.meta.env and import.meta.hot, which only Vite defines.
      unsupported: {cli: 'uses import.meta.env and import.meta.hot, which only Vite defines'},
      paths: {},
      ignoreHttp: [],
    };
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const t = manifest.benchTargets;
  const last = 'f' + String(t.features - 1).padStart(t.route.length - 1, '0');
  return {
    id,
    label: manifest.components.toLocaleString('en-US'),
    dir,
    kind: 'generated',
    components: manifest.components,
    manifest,
    sourceDirs: ['src'],
    rootTag: '<app-root',
    // The shell rendered every feature link, and the first lazy route rendered its page heading.
    gate: `() => document.querySelectorAll('app-root nav a').length === ${t.features}
      && !!document.querySelector('app-root app-${t.route}-page h3')`,
    // A build must also render the last lazy route, not only the first.
    lazy: {path: last, gate: `() => !!document.querySelector('app-root app-${last}-page h3')`},
    template: t.template,
    ts: t.ts,
    unsupported: {},
    paths: {},
    ignoreHttp: [],
  };
}

/**
 * A real app from real/<name>.json, as real.mjs set it up. Only two tools run it: the plugin, and
 * the app's own CLI (`cli` in the pin: the Angular CLI or Nx). Everything else is marked
 * unsupported, because the bench doesn't write setups for Analog or @oxc-angular/vite on apps
 * that need file replacements, path aliases or a stub API.
 */
function loadRealApp(id, benchFile) {
  const b = JSON.parse(fs.readFileSync(benchFile, 'utf8'));
  const dir = path.dirname(benchFile);
  const unsupported = {};
  for (const t of ['cli', 'nx', 'analog', 'analog-hmr', 'oxc', 'ngp-notc']) {
    if (t !== b.cli.id) unsupported[t] = t === 'cli' || t === 'nx' ? `is built with ${b.cli.label}, not that CLI` : 'has no bench setup for this tool on a real app';
  }
  return {
    id,
    label: b.label,
    dir,
    kind: 'real',
    components: b.components,
    pin: b,
    sourceDirs: b.sourceDirs,
    rootTag: b.rootTag,
    gate: b.gate,
    lazy: b.lazy,
    template: b.template,
    ts: b.ts,
    stub: b.stub ?? null,
    // The app's own CLI, as a tool the harness can run. real.mjs wrote the pin; see lib/tools.mjs.
    ownTool: b.cli,
    ngp: b.ngp,
    unsupported,
    // Where each tool serves the app, in dev and from its build: Ghostfolio's Nx dev server
    // serves /en/, and both tools' localized builds sit under /en/.
    paths: {[b.cli.id]: {dev: b.cli.devPath ?? '/', build: b.cli.buildBase ?? '/'}, ngp: {dev: b.ngp.devPath ?? '/', build: b.ngp.buildBase ?? '/'}},
    ignoreHttp: b.ignoreHttp ?? [],
  };
}

/** SHA-256 over every file under the app's source directories, to check that a run left it as it found it. */
export function hashSources(dir, sourceDirs = ['src']) {
  const hash = createHash('sha256');
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), {withFileTypes: true}).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      const child = path.posix.join(rel, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) walk(child);
      else hash.update(child + '\0').update(fs.readFileSync(path.join(dir, child))).update('\0');
    }
  };
  for (const s of sourceDirs) if (fs.existsSync(path.join(dir, s))) walk(s);
  return hash.digest('hex');
}
