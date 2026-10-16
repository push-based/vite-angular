// The apps the benchmark runs, and what the harness needs to know about each: where it lives,
// how to tell it rendered, and which files an edit touches.

import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';

export const BENCH = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REPO = path.resolve(BENCH, '..');
export const APPS_DIR = path.join(BENCH, '.work/apps');

export const GENERATED_SIZES = [100, 1000, 5000];

/** @returns {{id: string, dir: string, kind: 'generated'|'playground', ...}} */
export function loadApp(id) {
  const dir = path.join(APPS_DIR, id);
  if (!fs.existsSync(dir)) throw new Error(`${id} isn't set up: run \`node apps.mjs\` first`);
  if (id === 'playground') {
    return {
      id,
      dir,
      kind: 'playground',
      components: 21,
      // The overview page renders its hero heading and the pipeline list.
      gate: `() => !!document.querySelector('app-root h1')?.textContent.includes('one module at a time')
        && document.querySelectorAll('app-root ol.pipeline li').length === 4`,
      template: 'src/app/pages/overview/overview.html',
      ts: {
        file: 'src/app/pages/overview/overview.ts',
        find: `'Only what the browser imports, when it imports it.'`,
      },
      // `ng serve` can't run it: it reads import.meta.env and import.meta.hot, which only Vite defines.
      unsupported: {cli: 'uses import.meta.env and import.meta.hot, which only Vite defines'},
    };
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const t = manifest.benchTargets;
  return {
    id,
    dir,
    kind: 'generated',
    components: manifest.components,
    manifest,
    // The shell rendered every feature link, and the first lazy route rendered its page heading.
    gate: `() => document.querySelectorAll('app-root nav a').length === ${t.features}
      && !!document.querySelector('app-root app-${t.route}-page h3')`,
    template: t.template,
    ts: t.ts,
    unsupported: {},
  };
}

/** SHA-256 over every file under src/, to check that a run left the app as it found it. */
export function hashSources(dir) {
  const hash = createHash('sha256');
  const walk = (rel) => {
    for (const entry of fs.readdirSync(path.join(dir, rel), {withFileTypes: true}).sort((a, b) =>
      a.name < b.name ? -1 : 1,
    )) {
      const child = path.posix.join(rel, entry.name);
      if (entry.isDirectory()) walk(child);
      else hash.update(child + '\0').update(fs.readFileSync(path.join(dir, child))).update('\0');
    }
  };
  walk('src');
  return hash.digest('hex');
}
