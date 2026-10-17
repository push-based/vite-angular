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
const getRaw = (app, tool, metric) => latest.get(`${app}|${tool}|${metric}`);
// Once `cli` stands for "the app's own CLI", it answers for Nx too.
const get = (app, tool, metric) => getRaw(app, tool, metric) ?? (tool === 'cli' && realOnly ? getRaw(app, 'nx', metric) : undefined);

// Generated apps by size, then the playground, then real apps in the order they were run.
const KNOWN = ['standalone-100-s1', 'standalone-1000-s1', 'standalone-5000-s1', 'playground'];
const seenApps = [...new Set([...latest.values()].map((r) => r.app))];
const APPS = [...KNOWN.filter((a) => seenApps.includes(a)), ...seenApps.filter((a) => !KNOWN.includes(a))];
const APP_LABEL = {
  'standalone-100-s1': '100',
  'standalone-1000-s1': '1,000',
  'standalone-5000-s1': '5,000',
  playground: 'playground',
};
for (const r of latest.values()) if (r.label && !APP_LABEL[r.app]) APP_LABEL[r.app] = r.label;
const TOOLS = ['ngp', 'ngp-notc', 'cli', 'nx', 'analog', 'analog-hmr', 'oxc'].filter((t) => [...latest.values()].some((r) => r.tool === t));
const TOOL_LABEL = {
  ngp: 'vite-plugin-ngp',
  'ngp-notc': 'vite-plugin-ngp, `typeCheck: false`',
  cli: 'Angular CLI',
  nx: 'Nx',
  analog: 'Analog',
  'analog-hmr': 'Analog, `liveReload: true`',
  oxc: '@oxc-angular/vite',
};
// A real app's own CLI is both "its CLI" and a tool: one row for `cli` and `nx` together when
// only real apps are in the tables, so Super Productivity's Angular CLI and Ghostfolio's Nx share
// the row "the app's own CLI".
const realOnly = APPS.every((a) => [...latest.values()].some((r) => r.app === a && r.kind === 'real'));
if (realOnly && TOOLS.includes('cli') && TOOLS.includes('nx')) {
  TOOLS.splice(TOOLS.indexOf('nx'), 1);
  TOOL_LABEL.cli = "the app's own CLI";
}
const own = (app, metric) => get(app, 'cli', metric) ?? get(app, 'nx', metric);

const time = (ms) => (ms >= 10_000 ? `${(ms / 1000).toFixed(1)} s` : ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const mem = (bytes) => (bytes >= 10 * 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(1)} GB` : bytes >= 2 ** 30 ? `${(bytes / 2 ** 30).toFixed(2)} GB` : `${Math.round(bytes / 2 ** 20).toLocaleString('en-US')} MB`);
const kb = (b) => (b < 10 * 1024 ? `${(b / 1024).toFixed(1)} kB` : `${Math.round(b / 1024).toLocaleString('en-US')} kB`);

function cell(r, key, extra = '', format = time) {
  if (!r) return '';
  if (r.unsupported) return 'n/a';
  if (!r.ok) return `failed${r.errors?.[0] ? ` ¹` : ''}`;
  const s = r[key];
  if (!s) return '';
  const noisy = s.madPct > 5 ? ` ±${Math.round(s.madPct)}%` : '';
  return `${format(s.median)}${noisy}${extra}`;
}

function table(title, metric, key, note, extra = () => '', format = time) {
  const rows = TOOLS.filter((t) => APPS.some((a) => get(a, t, metric)?.[key] || get(a, t, metric)?.unsupported || get(a, t, metric)?.ok === false));
  if (rows.length === 0) return '';
  const lines = [`### ${title}`, '', note, '', `| Tool | ${APPS.map((a) => APP_LABEL[a]).join(' | ')} |`, `|---|${APPS.map(() => '---:').join('|')}|`];
  for (const t of rows) lines.push(`| ${TOOL_LABEL[t]} | ${APPS.map((a) => cell(get(a, t, metric), key, extra(get(a, t, metric)), format)).join(' | ')} |`);
  return lines.join('\n') + '\n\n';
}

// Edits also show the fastest sample: Vite's file watcher on macOS adds a delay of either about
// 0 or about 100 ms to each edit, so the minimum is closer to the tool's own work.
const modeNote = (r) =>
  r?.ok && r.latency ? ` (${time(r.latency.min)})${r.mode && r.mode !== 'in-place' ? `, ${r.mode}` : ''}` : '';

let out = '';
out += table('Dev server: cold start to first contentful paint', 'dev-cold', 'fcp', 'Process start to the first paint of the rendered app, with every cache deleted first. Median.');
out += table('Dev server: restart to first contentful paint', 'dev-warm', 'fcp', 'The same, keeping the caches the previous start wrote.');
out += table('Template edit to DOM', 'edit-template', 'latency', 'Writing an external template until the new element is in the page. "reload" means the page reloaded to show it; otherwise the component updated in place. Median, and the fastest edit in brackets.', modeNote);
out += table('.ts edit to DOM', 'edit-ts', 'latency', "Changing a signal's initial value in a page component until the new text is in the page. Every tool reloads the page for this. Median, and the fastest edit in brackets.", modeNote);
out += table('Production build', 'build', 'time', 'Process start to exit, caches deleted first.');
out += table('Type error reported in the dev server', 'typecheck', 'error', "Planting a template type error until the dev server's terminal names it. Only the tools that type-check in dev.");
out += table('Type error cleared in the dev server', 'typecheck', 'clean', 'Removing it until the dev server reports the app clean again.');

// Memory: the dev server's process tree at its peak during a cold start and once the page had
// rendered and settled, after a session of edits, and a build's peak.
const settledNote = (r) => (r?.ok && r.memorySettled ? ` (${mem(r.memorySettled.median)} settled)` : '');
out += table('Dev server memory, cold start', 'dev-cold', 'memoryPeak', "Resident memory of the dev server's whole process tree, sampled every 100 ms: the peak between process start and the rendered page, and in brackets what it held once the page had rendered and settled. Median. Includes esbuild, tsgo, Sass and worker processes; shared pages count once per process.", settledNote, mem);
out += table('Dev server memory, restart', 'dev-warm', 'memoryPeak', 'The same for a restart with the caches kept.', settledNote, mem);
const editMemRows = TOOLS.filter((t) => APPS.some((a) => get(a, t, 'edit-ts')?.memory));
if (editMemRows.length) {
  const lines = ['### Dev server memory after edits', '', 'What the dev server held after the edit series (the warm-up and measured template and `.ts` edits, in one session), and in brackets its peak during that session.', '', `| Tool | ${APPS.map((a) => APP_LABEL[a]).join(' | ')} |`, `|---|${APPS.map(() => '---:').join('|')}|`];
  for (const t of editMemRows) {
    lines.push(`| ${TOOL_LABEL[t]} | ${APPS.map((a) => {
      const r = get(a, t, 'edit-ts');
      if (!r) return '';
      if (r.unsupported) return 'n/a';
      if (!r.ok || !r.memory) return 'failed ¹';
      return `${mem(r.memory.afterEdits)} (${mem(r.memory.peak)} peak)`;
    }).join(' | ')} |`);
  }
  out += lines.join('\n') + '\n\n';
}
out += table('Production build memory', 'build', 'memoryPeak', "Peak resident memory of the build's whole process tree, sampled every 100 ms. Median.", () => '', mem);

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

// The real apps, pinned.
const realApps = new Map();
for (const f of files) for (const a of f.apps ?? []) if (a.kind === 'real') realApps.set(a.id, a);
if (realApps.size) {
  out += '\n### Real apps\n\n| App | Commit | Components | Built with | Angular pinned to | Patch |\n|---|---|---:|---|---|---|\n';
  for (const a of realApps.values()) out += `| [${a.label}](${a.repo.replace(/\.git$/, '')}) | \`${a.sha.slice(0, 7)}\` | ${a.components} | ${a.cli} | ${a.angularVersion} | ${a.patch ? `\`${a.patch}\`` : 'none'} |\n`;
}

// Where the numbers came from.
const envs = [...new Map(files.map((f) => [f.file, f])).values()];
out += '\n### Environment\n\n';
for (const f of envs) {
  const e = f.environment;
  const loads = f.results.flatMap((r) => (r.samples ?? []).map((s) => s.load?.[0]).filter((l) => l != null));
  const loadRange = loads.length ? `${Math.min(...loads).toFixed(1)}–${Math.max(...loads).toFixed(1)}` : 'n/a';
  out += `- \`${path.basename(f.file)}\`: ${e.date.slice(0, 16).replace('T', ' ')} UTC, plugin at \`${e.ngp.plugin}\`${e.pluginDirty ? ' (uncommitted changes)' : ''}, repo at \`${e.commit}\`, ${e.ci ? `GitHub Actions [run](${e.ci.run})${e.ci.image ? ` on ${e.ci.image}` : ''}, ` : ''}${e.machine.cpu}, ${e.machine.cores} cores, ${e.machine.memoryGB} GB, ${e.machine.os}, ${e.machine.power ?? ''}. Node ${e.node}, Chrome ${e.chrome}. ${f.settings.warmup} warm-up and ${f.settings.runs} measured runs per start or build, ${f.settings.editWarmup} warm-up and ${f.settings.edits} measured edits. 1-minute load average during samples: ${loadRange}.\n`;
  out += `  Versions: ${Object.entries(e.versions).map(([k, v]) => `${k} ${v}`).join(', ')}. Patches: ${e.patches.join(', ') || 'none'}.\n`;
}

if (args.out) fs.writeFileSync(args.out, out);
process.stdout.write(out);
