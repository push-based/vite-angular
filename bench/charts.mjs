// Draws the docs site's benchmark figures from result files: SVG bar charts the site inlines, so
// they take their colors from the site's tokens and follow its dark theme.
//
// Every figure is horizontal bars on one shared scale, one panel per app, the plugin's bar in the
// brand violet and every other tool's in the de-emphasis gray: the row label names the tool, so
// color only has to say which bar is the plugin's. Values sit at the bar tips, so no one has to
// read them off the axis; the tables on the same page are the table view.
//
// Usage: node charts.mjs --generated results/a.json[,results/b.json] --real results/ci-*.json
//          [--out ../site/content/charts]

import * as fs from 'node:fs';
import * as path from 'node:path';
import {parseArgs} from 'node:util';
import {BENCH} from './lib/apps.mjs';
import {TOOL_LABEL, loadResults, mem, time} from './lib/results.mjs';

const {values: args} = parseArgs({
  options: {generated: {type: 'string'}, real: {type: 'string'}, out: {type: 'string', default: path.join(BENCH, '../site/content/charts')}},
});
if (!args.generated && !args.real) throw new Error('Usage: node charts.mjs --generated <results.json,...> --real <results.json,...>');
fs.mkdirSync(args.out, {recursive: true});

// --- the drawing -----------------------------------------------------------------------------

const FONT = 'var(--font-sans)';
const W = 640; // the docs column on a laptop; on a phone the figure scrolls sideways like a table
const LABEL_W = 168; // the row labels' column
const VALUE_W = 118; // room for a value label after the longest bar
const BAR_H = 16;
const ROW_H = 24;
const GROUP_GAP = 8;
const PANEL_GAP = 20;
const PANEL_HEAD = 26;
const LEGEND_H = 22;
const TOP = 6;
const AXIS_H = 22;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const plain = (s) => String(s).replace(/`/g, '');

/** Clean tick steps: 1, 2, 5 × 10^k, giving 3 to 6 ticks up to the maximum. */
function ticks(max) {
  if (max <= 0) return [0];
  const raw = max / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => max / s <= 6) ?? 10 * pow;
  const out = [];
  for (let v = 0; v <= max + 1e-9; v += step) out.push(v);
  return out;
}

/**
 * A figure: panels of groups of bars on one scale.
 * @param {{
 *   title: string, unit: 'time'|'memory',
 *   series: {id: string, label: string, emphasis?: boolean}[],
 *   panels: {title: string, groups: {label: string, bars: {series: string, value?: number, min?: number, noise?: number, suffix?: string, na?: string, tooltip?: string}[]}[]}[],
 *   marker?: string,
 * }} spec
 */
function figure(spec) {
  const fmt = spec.unit === 'memory' ? mem : time;
  const values = spec.panels.flatMap((p) => p.groups.flatMap((g) => g.bars.map((b) => b.value ?? 0)));
  const max = Math.max(...values, 1);
  const legend = spec.series.length > 1;
  const plotX = LABEL_W;
  const plotW = W - LABEL_W - VALUE_W;
  const x = (v) => plotX + (v / max) * plotW;
  const tickValues = ticks(max);
  // Axis unit: the ticks carry it once, the values carry their own.
  const tickLabel = (v) => (spec.unit === 'memory' ? (max >= 2 ** 30 ? `${+(v / 2 ** 30).toFixed(1)} GB` : `${Math.round(v / 2 ** 20)} MB`) : max >= 2000 ? `${+(v / 1000).toFixed(1)} s` : `${Math.round(v)} ms`);

  let y = TOP + (legend || spec.marker ? LEGEND_H : 0);
  const out = [];
  const rows = [];
  for (const panel of spec.panels) {
    rows.push({type: 'panel', title: panel.title, y});
    y += PANEL_HEAD;
    for (const group of panel.groups) {
      const groupTop = y;
      for (const bar of group.bars) {
        rows.push({type: 'bar', group, bar, y, first: y === groupTop});
        y += ROW_H;
      }
      y += GROUP_GAP;
    }
    y += PANEL_GAP - GROUP_GAP;
  }
  const plotBottom = y - PANEL_GAP + GROUP_GAP;
  const H = plotBottom + AXIS_H;

  // Grid first, so bars sit on it.
  for (const v of tickValues) {
    out.push(`<line class="grid" x1="${x(v).toFixed(1)}" x2="${x(v).toFixed(1)}" y1="${TOP + (legend || spec.marker ? LEGEND_H : 0)}" y2="${plotBottom}"/>`);
    out.push(`<text class="tick" x="${x(v).toFixed(1)}" y="${plotBottom + 15}" text-anchor="${v === 0 ? 'start' : 'middle'}">${tickLabel(v)}</text>`);
  }

  if (legend || spec.marker) {
    let lx = plotX;
    for (const s of spec.series) {
      if (legend) {
        out.push(`<rect class="bar ${s.emphasis ? 'bar--plugin' : 'bar--other'}" x="${lx}" y="${TOP + 4}" width="12" height="12" rx="2"/>`);
        out.push(`<text class="label" x="${lx + 17}" y="${TOP + 14}">${esc(plain(s.label))}</text>`);
        lx += 17 + plain(s.label).length * 7 + 20;
      }
    }
    if (spec.marker) {
      out.push(`<circle class="marker" cx="${lx + 6}" cy="${TOP + 10}" r="3.5"/>`);
      out.push(`<text class="label" x="${lx + 17}" y="${TOP + 14}">${esc(spec.marker)}</text>`);
    }
  }

  for (const row of rows) {
    if (row.type === 'panel') {
      out.push(`<text class="panel" x="0" y="${row.y + 16}">${esc(row.title)}</text>`);
      continue;
    }
    const {group, bar} = row;
    const series = spec.series.find((s) => s.id === bar.series);
    const cy = row.y + ROW_H / 2;
    if (row.first) out.push(`<text class="label" x="0" y="${cy + 4}">${esc(plain(group.label))}</text>`);
    if (bar.value == null) {
      out.push(`<text class="na" x="${plotX}" y="${cy + 4}">${esc(bar.na ?? 'n/a')}</text>`);
      continue;
    }
    const x1 = x(bar.value);
    const top = cy - BAR_H / 2;
    const w = Math.max(x1 - plotX, 1);
    const cls = `bar ${series?.emphasis ? 'bar--plugin' : 'bar--other'}`;
    // A 4 px rounded data-end, square at the baseline.
    const r = Math.min(4, w);
    const d = `M${plotX} ${top}H${(x1 - r).toFixed(1)}a${r} ${r} 0 0 1 ${r} ${r}V${top + BAR_H - r}a${r} ${r} 0 0 1 -${r} ${r}H${plotX}Z`;
    const tip = bar.tooltip ? `<title>${esc(bar.tooltip)}</title>` : '';
    out.push(`<path class="${cls}" d="${d}">${tip}</path>`);
    if (bar.min != null) out.push(`<circle class="marker" cx="${x(bar.min).toFixed(1)}" cy="${cy}" r="3.5"><title>fastest: ${esc(fmt(bar.min))}</title></circle>`);
    const noise = bar.noise > 5 ? ` ±${Math.round(bar.noise)}%` : '';
    out.push(`<text class="value" x="${(x1 + 6).toFixed(1)}" y="${cy + 4}">${esc(fmt(bar.value))}${noise}${bar.suffix ? `<tspan class="suffix">${esc(bar.suffix)}</tspan>` : ''}</text>`);
  }

  const style = `
    text{font-family:${FONT};font-size:13px;fill:var(--color-text)}
    .panel{font-weight:600;fill:var(--color-text-heading)}
    .tick{font-size:12px;fill:var(--color-text-muted);font-variant-numeric:tabular-nums}
    .value{font-variant-numeric:tabular-nums}
    .suffix,.na{fill:var(--color-text-muted)}
    .grid{stroke:var(--color-border);stroke-width:1;shape-rendering:crispEdges}
    .bar--plugin{fill:var(--color-brand)}
    .bar--other{fill:var(--color-neutral-400)}
    .marker{fill:var(--color-surface);stroke:var(--color-text-heading);stroke-width:1.5}
  `.replace(/\s+/g, ' ').trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(spec.title)}"><style>${style}</style>${out.join('')}</svg>\n`;
}

function write(name, spec) {
  const file = path.join(args.out, `${name}.svg`);
  fs.writeFileSync(file, figure(spec));
  console.log(`wrote ${path.relative(process.cwd(), file)}`);
}

// --- what each figure shows ----------------------------------------------------------------

/** A bar from a start, edit or build record: its median, noise and, for an edit, the fastest. */
function barFrom(r, key, series, {min = false, mode = false} = {}) {
  if (!r) return {series, na: ''};
  if (r.unsupported) return {series, na: 'n/a'};
  if (!r.ok || !r[key]) return {series, na: 'failed'};
  const s = r[key];
  const fmtValue = key.startsWith('memory') ? mem : time;
  return {
    series,
    value: s.median,
    noise: s.madPct,
    min: min ? s.min : undefined,
    suffix: mode && r.mode && r.mode !== 'in-place' ? `, ${r.mode}` : undefined,
    tooltip: `${plain(TOOL_LABEL[r.tool] ?? r.toolLabel)}: median ${fmtValue(s.median)} of ${s.n}, fastest ${fmtValue(s.min)}, slowest ${fmtValue(s.max)}`,
  };
}

if (args.generated) {
  const R = loadResults(args.generated.split(','));
  const apps = R.apps.filter((a) => R.appLabel[a] !== undefined);
  const panelTitle = (a) => (a === 'playground' ? 'The playground, 21 components' : `${R.appLabel[a]} components`);
  const tools = ['ngp', 'cli', 'analog', 'oxc'];
  const series = tools.map((t) => ({id: t, label: TOOL_LABEL[t], emphasis: t === 'ngp'}));
  const byTool = (metric, key, opts, extraTools = []) => ({
    series: [...series, ...extraTools.map((t) => ({id: t, label: TOOL_LABEL[t], emphasis: t === 'ngp'}))],
    panels: apps.map((a) => ({
      title: panelTitle(a),
      groups: [...tools, ...extraTools].map((t) => ({label: TOOL_LABEL[t], bars: [barFrom(R.get(a, t, metric), key, t, opts)]})),
    })),
  });
  // One bar per tool, so the legend is the row labels: a single series for the renderer.
  const single = (spec) => ({...spec, series: [{id: 'ngp', label: 'vite-plugin-ngp', emphasis: true}]});
  write('dev-cold', {title: 'Dev server cold start to first contentful paint, by tool and app size', unit: 'time', ...single(byTool('dev-cold', 'fcp'))});
  write('dev-warm', {title: 'Dev server restart to first contentful paint, by tool and app size', unit: 'time', ...single(byTool('dev-warm', 'fcp'))});
  write('edit-template', {title: 'Template edit to DOM, by tool and app size', unit: 'time', marker: 'fastest edit', ...single(byTool('edit-template', 'latency', {min: true, mode: true}))});
  write('edit-ts', {title: '.ts edit to DOM, by tool and app size', unit: 'time', marker: 'fastest edit', ...single(byTool('edit-ts', 'latency', {min: true}))});
  const build = byTool('build', 'time', {}, R.tools.includes('ngp-notc') ? ['ngp-notc'] : []);
  // The no-type-check variant sits under the plugin's row, not at the end.
  for (const p of build.panels) {
    const i = p.groups.findIndex((g) => g.bars[0].series === 'ngp-notc');
    if (i > 0) p.groups.splice(1, 0, ...p.groups.splice(i, 1));
  }
  write('build', {title: 'Production build time, by tool and app size', unit: 'time', ...single(build)});
  if ([...R.latest.values()].some((r) => r.memorySettled)) {
    write('memory-dev', {title: 'Dev server memory after a restart, once the page has rendered, by tool and app size', unit: 'memory', ...single(byTool('dev-warm', 'memorySettled'))});
    write('memory-build', {title: 'Peak memory of a production build, by tool and app size', unit: 'memory', ...single(byTool('build', 'memoryPeak'))});
  }
}

if (args.real) {
  const R = loadResults(args.real.split(','));
  const series = [
    {id: 'ngp', label: 'vite-plugin-ngp', emphasis: true},
    {id: 'own', label: "the app's own CLI"},
  ];
  const pair = (a, metric, key, opts) => [barFrom(R.get(a, 'ngp', metric), key, 'ngp', opts), barFrom(R.own(a, metric), key, 'own', opts)];
  const panels = (groups) => R.apps.map((a) => ({title: R.appLabel[a], groups: groups(a)}));
  write('real-waits', {
    title: 'Dev server cold start, restart and production build on the real apps, plugin against the app\'s own CLI',
    unit: 'time',
    series,
    panels: panels((a) => [
      {label: 'Cold start', bars: pair(a, 'dev-cold', 'fcp')},
      {label: 'Restart', bars: pair(a, 'dev-warm', 'fcp')},
      {label: 'Production build', bars: pair(a, 'build', 'time')},
    ]),
  });
  write('real-edits', {
    title: 'Template and .ts edit to DOM on the real apps, plugin against the app\'s own CLI',
    unit: 'time',
    series,
    marker: 'fastest edit',
    panels: panels((a) => [
      {label: 'Template edit', bars: pair(a, 'edit-template', 'latency', {min: true, mode: true})},
      ...(R.get(a, 'ngp', 'edit-ts')?.unsupported ? [] : [{label: '.ts edit', bars: pair(a, 'edit-ts', 'latency', {min: true, mode: true})}]),
    ]),
  });
  const editMem = (a, s) => {
    const r = s === 'ngp' ? R.get(a, 'ngp', 'edit-template') : R.own(a, 'edit-template');
    if (!r?.ok || !r.memory) return {series: s, na: r ? 'failed' : ''};
    return {series: s, value: r.memory.afterEdits, tooltip: `${plain(TOOL_LABEL[r.tool] ?? r.toolLabel)}: ${mem(r.memory.afterEdits)} after the edits, peak ${mem(r.memory.peak)} during them`};
  };
  write('real-memory', {
    title: 'Resident memory of each tool\'s processes on the real apps: the dev server after a restart and after the edits, and a build\'s peak',
    unit: 'memory',
    series,
    panels: panels((a) => [
      {label: 'Dev server, restarted', bars: pair(a, 'dev-warm', 'memorySettled')},
      {label: 'Dev server, after edits', bars: [editMem(a, 'ngp'), editMem(a, 'own')]},
      {label: 'Production build, peak', bars: pair(a, 'build', 'memoryPeak')},
    ]),
  });
}
