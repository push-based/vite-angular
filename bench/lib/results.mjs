// Reads result files the way report.mjs and charts.mjs both need them: later files win for the
// same app, tool and metric, so a rerun of one series can be merged over a full run.

import * as fs from 'node:fs';

export const KNOWN_APPS = ['standalone-100-s1', 'standalone-1000-s1', 'standalone-5000-s1', 'playground'];
export const TOOL_ORDER = ['ngp', 'ngp-notc', 'cli', 'nx', 'analog', 'analog-hmr', 'oxc'];

export const TOOL_LABEL = {
  ngp: 'vite-plugin-ngp',
  'ngp-notc': 'vite-plugin-ngp, `typeCheck: false`',
  cli: 'Angular CLI',
  nx: 'Nx',
  analog: 'Analog',
  'analog-hmr': 'Analog, `liveReload: true`',
  oxc: '@oxc-angular/vite',
};

/** @param files result file paths */
export function loadResults(files) {
  const loaded = files.map((f) => ({file: f, ...JSON.parse(fs.readFileSync(f, 'utf8'))}));
  const latest = new Map();
  for (const f of loaded) for (const r of f.results) latest.set(`${r.app}|${r.tool}|${r.metric}`, {...r, file: f.file});
  const appLabel = {
    'standalone-100-s1': '100',
    'standalone-1000-s1': '1,000',
    'standalone-5000-s1': '5,000',
    playground: 'playground',
  };
  for (const r of latest.values()) if (r.label && !appLabel[r.app]) appLabel[r.app] = r.label;
  const seen = [...new Set([...latest.values()].map((r) => r.app))];
  const apps = [...KNOWN_APPS.filter((a) => seen.includes(a)), ...seen.filter((a) => !KNOWN_APPS.includes(a))];
  const tools = TOOL_ORDER.filter((t) => [...latest.values()].some((r) => r.tool === t));
  const get = (app, tool, metric) => latest.get(`${app}|${tool}|${metric}`);
  /** A real app's own CLI: the Angular CLI or Nx, whichever ran on it. */
  const own = (app, metric) => get(app, 'cli', metric) ?? get(app, 'nx', metric);
  return {files: loaded, latest, apps, tools, appLabel, get, own};
}

export const time = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
export const mem = (bytes) => (bytes >= 10 * 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(1)} GB` : bytes >= 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(2)} GB` : `${Math.round(bytes / 2 ** 20).toLocaleString('en-US')} MB`);
export const kb = (b) => (b < 10 * 1024 ? `${(b / 1024).toFixed(1)} kB` : `${Math.round(b / 1024).toLocaleString('en-US')} kB`);
