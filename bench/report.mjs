// Turns result files into markdown tables. Later files win for the same app, tool and metric, so
// a rerun of one series can be merged over a full run.
//
// Usage: node report.mjs results/a.json [results/b.json ...] [--out results/report.md]

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parseArgs} from 'node:util';

const {values: args, positionals} = parseArgs({allowPositionals: true, options: {out: {type: 'string'}}});
if (positionals.length === 0) throw new Error('Usage: node report.mjs <results.json> [...]');

const files = positionals.map((f) => ({file: f, ...JSON.parse(fs.readFileSync(f, 'utf8'))}));
const latest = new Map();
for (const f of files) for (const r of f.results) latest.set(`${r.app}|${r.tool}|${r.metric}`, {...r, file: f.file});
const get = (app, tool, metric) => latest.get(`${app}|${tool}|${metric}`);

const APPS = ['standalone-100-s1', 'standalone-1000-s1', 'standalone-5000-s1', 'playground'].filter((a) =>
  [...latest.values()].some((r) => r.app === a),
);
const APP_LABEL = {
  'standalone-100-s1': '100',
  'standalone-1000-s1': '1,000',
  'standalone-5000-s1': '5,000',
  playground: 'playground',
};
const TOOLS = ['ngp', 'cli', 'analog', 'analog-hmr', 'oxc'].filter((t) => [...latest.values()].some((r) => r.tool === t));
const TOOL_LABEL = {
  ngp: 'vite-plugin-ngp',
  cli: 'Angular CLI',
  analog: 'Analog',
  'analog-hmr': 'Analog, `liveReload: true`',
  oxc: '@oxc-angular/vite',
};

const time = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const kb = (b) => (b < 10 * 1024 ? `${(b / 1024).toFixed(1)} kB` : `${Math.round(b / 1024).toLocaleString('en-US')} kB`);

function cell(r, key, extra = '') {
  if (!r) return '';
  if (r.unsupported) return 'n/a';
  if (!r.ok) return `failed${r.errors?.[0] ? ` ¹` : ''}`;
  const s = r[key];
  if (!s) return '';
  const noisy = s.madPct > 5 ? ` ±${Math.round(s.madPct)}%` : '';
  return `${time(s.median)}${noisy}${extra}`;
}

function table(title, metric, key, note, extra = () => '') {
  const rows = TOOLS.filter((t) => APPS.some((a) => get(a, t, metric)));
  if (rows.length === 0) return '';
  const lines = [`### ${title}`, '', note, '', `| Tool | ${APPS.map((a) => APP_LABEL[a]).join(' | ')} |`, `|---|${APPS.map(() => '---:').join('|')}|`];
  for (const t of rows) lines.push(`| ${TOOL_LABEL[t]} | ${APPS.map((a) => cell(get(a, t, metric), key, extra(get(a, t, metric)))).join(' | ')} |`);
  return lines.join('\n') + '\n\n';
}

const modeNote = (r) => (r?.ok && r.mode && r.mode !== 'in-place' ? `, ${r.mode}` : '');

let out = '';
out += table('Dev server: cold start to first contentful paint', 'dev-cold', 'fcp', 'Process start to the first paint of the rendered app, with every cache deleted first. Median.');
out += table('Dev server: restart to first contentful paint', 'dev-warm', 'fcp', 'The same, keeping the caches the previous start wrote.');
out += table('Template edit to DOM', 'edit-template', 'latency', 'Writing an external template until the new element is in the page. "reload" means the page reloaded to show it; otherwise the component updated in place.', modeNote);
out += table('.ts edit to DOM', 'edit-ts', 'latency', "Changing a signal's initial value in a page component until the new text is in the page. Every tool reloads the page for this.", modeNote);
out += table('Production build', 'build', 'time', 'Process start to exit, caches deleted first.');

// Sizes: one table per app.
const sizeRows = [];
for (const a of APPS) {
  for (const t of TOOLS) {
    const r = get(a, t, 'build');
    if (!r?.ok || !r.sizes) continue;
    const {total, initial} = r.sizes;
    sizeRows.push(`| ${APP_LABEL[a]} | ${TOOL_LABEL[t]} | ${kb(total.js.raw)} | ${kb(total.js.gzip)} | ${kb(initial.js.raw)} | ${kb(initial.js.gzip)} | ${kb(total.css.raw)} |`);
  }
}
if (sizeRows.length) {
  out += `### Bundle size\n\nAll JavaScript in the build, and the initial part: what index.html loads plus everything it imports statically, before any lazy route. Gzip at level 9, per file.\n\n| App | Tool | JS | JS gzip | Initial JS | Initial gzip | CSS |\n|---|---|---:|---:|---:|---:|---:|\n${sizeRows.join('\n')}\n`;
}

const failures = [...latest.values()].filter((r) => !r.ok && !r.unsupported);
if (failures.length) {
  out += '\n¹ Failed a correctness gate, so not timed:\n\n';
  for (const r of failures) out += `- ${r.app}, ${r.tool}, ${r.metric}: ${String(r.errors?.[0] ?? '').split('\n')[0]}\n`;
}
const unsupported = [...latest.values()].filter((r) => r.unsupported);
const seen = new Set();
for (const r of unsupported) {
  if (seen.has(`${r.app}|${r.tool}`)) continue;
  seen.add(`${r.app}|${r.tool}`);
  out += `\nn/a: ${TOOL_LABEL[r.tool]} can't run the ${r.app}: it ${r.unsupported}.\n`;
}

// Where the numbers came from.
const envs = [...new Map(files.map((f) => [f.file, f])).values()];
out += '\n### Environment\n\n';
for (const f of envs) {
  const e = f.environment;
  const loads = f.results.flatMap((r) => (r.samples ?? []).map((s) => s.load?.[0]).filter((l) => l != null));
  const loadRange = loads.length ? `${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)}` : 'n/a';
  out += `- \`${path.basename(f.file)}\`: ${e.date.slice(0, 16).replace('T', ' ')} UTC, commit \`${e.commit}\`${e.dirty ? ' (uncommitted changes)' : ''}, ${e.machine.cpu}, ${e.machine.cores} cores, ${e.machine.memoryGB} GB, ${e.machine.os}, ${e.machine.power ?? ''}. Node ${e.node}, Chrome ${e.chrome}. ${f.settings.warmup} warm-up and ${f.settings.runs} measured runs per start or build, ${f.settings.editWarmup} warm-up and ${f.settings.edits} measured edits. 1-minute load average during samples: ${loadRange}.\n`;
  out += `  Versions: ${Object.entries(e.versions).map(([k, v]) => `${k} ${v}`).join(', ')}. Patches: ${e.patches.join(', ') || 'none'}. ngp plugin at \`${e.ngp.plugin}\`.\n`;
}

if (args.out) fs.writeFileSync(args.out, out);
process.stdout.write(out);
