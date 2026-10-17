// Measures vite-plugin-ngp against the Angular CLI, Analog and @oxc-angular/vite on the same apps,
// and against a real app's own CLI (the Angular CLI or Nx) on that app.
//
//   dev-cold   process start to first contentful paint, every cache deleted first
//   dev-warm   the same with the tool's caches from the previous start: a restart
//   edit       write a file, time until the new content is in the DOM; a template edit and a .ts edit
//   build      production build, caches deleted first, then a boot check and the bundle's size
//   typecheck  (ngp and the CLI, which type-check in dev) plant a template type error, time until
//              the dev server reports it; remove it, time until it reports the app clean
//
// Every start, edit series and build also records memory: the peak resident set of the tool's
// whole process tree while it ran, sampled every 100 ms (lib/memory.mjs), and for a dev server
// what it held once the page had rendered and settled.
//
// Every sample passes its gate or isn't counted: the app rendered (every feature link and the
// first route's heading, or the playground's overview, or a real app's shell and first page), the
// page logged no errors, an edit's marker reached the DOM, a build exited 0 and its output boots.
// The app's sources are hashed before and after.
//
// Usage: node run.mjs [--apps standalone-100-s1,...,super-productivity,ghostfolio]
//          [--tools ngp,cli,nx,analog,oxc] [--metrics dev-cold,dev-warm,edit,build,typecheck]
//          [--runs 5] [--warmup 1] [--edits 10] [--edit-warmup 2] [--max-load 4]
//          [--out results/<name>.json]

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {setTimeout as sleep} from 'node:timers/promises';
import {parseArgs} from 'node:util';
import {BENCH, hashSources, loadApp} from './lib/apps.mjs';
import {gateHolds, launch, openApp} from './lib/browser.mjs';
import {environment, waitForQuiet} from './lib/env.mjs';
import {sampleMemory} from './lib/memory.mjs';
import {run, start, stop, waitForHttp} from './lib/proc.mjs';
import {serveStatic} from './lib/serve.mjs';
import {bundleSizes} from './lib/sizes.mjs';
import {summarize} from './lib/stats.mjs';
import {TOOLS} from './lib/tools.mjs';

const {values: args} = parseArgs({
  options: {
    apps: {type: 'string', default: 'standalone-100-s1,standalone-1000-s1,standalone-5000-s1,playground'},
    tools: {type: 'string', default: 'ngp,cli,analog,oxc'},
    metrics: {type: 'string', default: 'dev-cold,dev-warm,edit,build'},
    runs: {type: 'string', default: '5'},
    warmup: {type: 'string', default: '1'},
    edits: {type: 'string', default: '10'},
    'edit-warmup': {type: 'string', default: '2'},
    'max-load': {type: 'string'},
    port: {type: 'string', default: '4310'},
    out: {type: 'string'},
  },
});

const RUNS = Number(args.runs);
const WARMUP = Number(args.warmup);
const EDITS = Number(args.edits);
const EDIT_WARMUP = Number(args['edit-warmup']);
const MAX_LOAD = args['max-load'] ? Number(args['max-load']) : null;
const PORT = Number(args.port);
const devUrl = (app, tool) => `http://127.0.0.1:${PORT}${app.paths[tool.id]?.dev ?? '/'}`;
const metrics = args.metrics.split(',');
const tools = args.tools.split(',').map((t) => {
  if (!TOOLS[t]) throw new Error(`unknown tool ${t}`);
  return TOOLS[t];
});
const apps = args.apps.split(',').map(loadApp);

if (tools.some((t) => t.id === 'ngp') && !process.env['NGP_TOOLCHAIN']) {
  throw new Error('Set NGP_TOOLCHAIN to an ngp build (toolchain/out)');
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.resolve(args.out ?? path.join(BENCH, 'results', `${stamp}.json`));
fs.mkdirSync(path.dirname(outFile), {recursive: true});

const browser = await launch();
const result = {
  environment: environment(await browser.version()),
  settings: {runs: RUNS, warmup: WARMUP, edits: EDITS, editWarmup: EDIT_WARMUP, maxLoad: MAX_LOAD},
  // What ran: for a real app, the commit, the patch and the files the bench added.
  apps: apps.map((a) =>
    a.kind === 'real'
      ? {id: a.id, label: a.label, kind: a.kind, components: a.components, repo: a.pin.repo, sha: a.pin.sha, angularVersion: a.pin.angularVersion, cli: a.ownTool.label, patch: fs.existsSync(path.join(BENCH, 'real', `${a.id}.patch`)) ? `real/${a.id}.patch` : null, added: a.pin.added, install: a.pin.install}
      : {id: a.id, label: a.label, kind: a.kind, components: a.components},
  ),
  results: [],
};
const save = () => fs.writeFileSync(outFile, JSON.stringify(result, null, 2) + '\n');
save();
console.log(`writing ${path.relative(process.cwd(), outFile)}`);

// Edits write into the app; put files back however the run ends.
const pendingRestores = new Map();
const restoreAll = () => {
  for (const [file, content] of pendingRestores) fs.writeFileSync(file, content);
  pendingRestores.clear();
};
process.on('SIGINT', () => {
  restoreAll();
  process.exit(130);
});

const rmCaches = (tool, app) => {
  for (const dir of tool.caches(app)) fs.rmSync(dir, {recursive: true, force: true});
};

function record(app, tool, metric, data) {
  const entry = {app: app.id, label: app.label, kind: app.kind, components: app.components, tool: tool.id, toolLabel: tool.id === 'cli' || tool.id === 'nx' ? (app.ownTool?.label ?? tool.label) : tool.label, metric, ...data};
  result.results.push(entry);
  save();
  return entry;
}

const fmt = (ms) => (ms >= 1000 ? `${(ms / 1000).toFixed(2)} s` : `${Math.round(ms)} ms`);
const mb = (bytes) => `${Math.round(bytes / 2 ** 20)} MB`;

/** The paths a real app's stub API answers, for the static server that serves a build. */
const stubProxy = (app) => (app.stub ? app.stub.proxy.map((p) => ({path: p, target: `http://127.0.0.1:${app.stub.port}`})) : []);

// ---------------------------------------------------------------------------------------------

/** One dev-server start: process spawn to first contentful paint of the rendered app. */
async function devStart(app, tool) {
  const load = await waitForQuiet(MAX_LOAD);
  const url = devUrl(app, tool);
  const t0 = Date.now();
  const proc = start(tool.dev(app, PORT), app.dir);
  const memory = sampleMemory(proc.child.pid);
  try {
    const answeredAt = await waitForHttp(url, proc, 600_000, app.rootTag);
    const opened = await openApp(browser, url, app.gate, {settleMs: 2000, ignoreHttp: app.ignoreHttp});
    const errors = [...opened.errors];
    if (!(await gateHolds(opened.page, app.gate).catch(() => false))) errors.push('gate no longer holds once settled');
    // The page has rendered and settled: what the dev server holds now is what it holds while
    // you work, before any edit.
    const settled = await memory.sample();
    const {peak} = memory.stop();
    const sample = {
      fcp: opened.fcpAt - t0,
      // Differs from fcp only when the optimizer reloaded the page after its first paint.
      firstPaint: opened.firstPaint - t0,
      rendered: opened.renderedAt - t0,
      answered: answeredAt - t0,
      documents: opened.documents(),
      memory: {peak: peak.rss, peakProcesses: peak.processes, settled: settled.rss, settledProcesses: settled.processes},
      load,
    };
    await opened.context.close();
    return {sample, errors};
  } catch (e) {
    return {sample: null, errors: [`${e.message}\n${proc.output().slice(-3000)}`]};
  } finally {
    memory.stop();
    await stop(proc);
  }
}

async function devSeries(app, active, metric) {
  const samples = new Map(active.map((t) => [t.id, []]));
  const failed = new Map();
  if (metric === 'dev-warm') {
    // A restart reuses the caches the previous start wrote, so make sure there is one.
    for (const tool of active) {
      const {errors} = await devStart(app, tool);
      if (errors.length) failed.set(tool.id, errors);
    }
  }
  for (let round = 0; round < WARMUP + RUNS; round++) {
    for (const tool of active) {
      if (failed.has(tool.id)) continue;
      if (metric === 'dev-cold') rmCaches(tool, app);
      const {sample, errors} = await devStart(app, tool);
      if (errors.length) {
        failed.set(tool.id, errors);
        console.log(`  ${tool.id} ${metric}: FAILED\n    ${errors.join('\n    ').slice(0, 2000)}`);
        continue;
      }
      const warm = round < WARMUP;
      if (!warm) samples.get(tool.id).push(sample);
      console.log(`  ${tool.id} ${metric} ${warm ? 'warm-up' : `#${round - WARMUP + 1}`}: FCP ${fmt(sample.fcp)} (answered ${fmt(sample.answered)}, ${sample.documents} document(s), memory ${mb(sample.memory.peak)} peak / ${mb(sample.memory.settled)} settled over ${sample.memory.settledProcesses} processes, load ${sample.load[0]})`);
    }
  }
  for (const tool of active) {
    const s = samples.get(tool.id);
    record(app, tool, metric, {
      ok: !failed.has(tool.id),
      errors: failed.get(tool.id) ?? [],
      samples: s,
      fcp: summarize(s.map((x) => x.fcp)),
      rendered: summarize(s.map((x) => x.rendered)),
      answered: summarize(s.map((x) => x.answered)),
      memoryPeak: summarize(s.map((x) => x.memory.peak)),
      memorySettled: summarize(s.map((x) => x.memory.settled)),
    });
  }
}

// ---------------------------------------------------------------------------------------------

/** Edits in one dev-server session: a template edit, then a .ts edit, each repeated. */
async function editSeries(app, tool) {
  const seen = new Map();
  const waiters = new Map();
  const onMarker = (n, at, origin) => {
    if (!seen.has(n)) seen.set(n, {at, origin});
    waiters.get(n)?.();
  };
  const waitMarker = (n, timeoutMs) =>
    seen.has(n)
      ? Promise.resolve()
      : Promise.race([
          new Promise((resolve) => waiters.set(n, resolve)),
          sleep(timeoutMs, null, {ref: false}).then(() => {
            throw new Error(`bench-mark-${n} never reached the DOM in ${timeoutMs} ms`);
          }),
        ]);

  const url = devUrl(app, tool);
  const proc = start(tool.dev(app, PORT), app.dir);
  const memory = sampleMemory(proc.child.pid);
  const out = {template: [], ts: []};
  const errors = [];
  let opened;
  let memoryAfter = null;
  try {
    await waitForHttp(url, proc, 600_000, app.rootTag);
    opened = await openApp(browser, url, app.gate, {markers: onMarker, ignoreHttp: app.ignoreHttp});
    await sleep(1000);
    const page = opened.page;
    const timeOrigin = async () => {
      for (let i = 0; i < 200; i++) {
        try {
          if (await gateHolds(page, app.gate)) return await page.evaluate(() => performance.timeOrigin);
        } catch {}
        await sleep(25);
      }
      throw new Error('page never settled after the edit');
    };
    let n = 0;
    // A real app may have no .ts edit target (its pin says why); then only templates are edited.
    for (const kind of app.ts ? ['template', 'ts'] : ['template']) {
      const file = path.join(app.dir, kind === 'template' ? app.template : app.ts.file);
      const original = fs.readFileSync(file, 'utf8');
      pendingRestores.set(file, original);
      const edited = (m) => {
        if (kind === 'template') return `${original}\n<p>bench-mark-${m}</p>\n`;
        const {find} = app.ts;
        // Before the string's closing quote: a plain string's, or a $localize template's backtick.
        const q = Math.max(find.lastIndexOf("'"), find.lastIndexOf('`'));
        if (!original.includes(find)) throw new Error(`${app.ts.file} no longer contains ${find}`);
        return original.replace(find, () => `${find.slice(0, q)} bench-mark-${m}${find.slice(q)}`);
      };
      for (let i = 0; i < EDIT_WARMUP + EDITS; i++) {
        const m = ++n;
        const before = await timeOrigin();
        const load = os.loadavg().map((l) => Math.round(l * 100) / 100);
        const t0 = Date.now();
        fs.writeFileSync(file, edited(m));
        await waitMarker(m, 120_000);
        const {at, origin} = seen.get(m);
        const sample = {ms: at - t0, mode: origin === before ? 'in-place' : 'reload', load};
        // The update has to stick: no late reload that loses it, and the app still renders.
        await sleep(800);
        await timeOrigin();
        const still = await page.evaluate((mm) => document.body.textContent.includes(`bench-mark-${mm}`), m);
        if (!still) throw new Error(`bench-mark-${m} disappeared after the update`);
        if (i >= EDIT_WARMUP) out[kind].push(sample);
        console.log(`  ${tool.id} edit ${kind} ${i < EDIT_WARMUP ? 'warm-up' : `#${i - EDIT_WARMUP + 1}`}: ${fmt(sample.ms)} (${sample.mode})`);
      }
      fs.writeFileSync(file, original);
      pendingRestores.delete(file);
      await sleep(1500);
      await timeOrigin();
    }
    // What the dev server holds after a session of edits, against what it held after the start.
    memoryAfter = await memory.sample();
    errors.push(...opened.errors);
  } catch (e) {
    errors.push(`${e.message}\n${proc.output().slice(-3000)}`);
  } finally {
    restoreAll();
    const {peak} = memory.stop();
    memoryAfter = memoryAfter ? {peak: peak.rss, afterEdits: memoryAfter.rss, processes: memoryAfter.processes} : null;
    await opened?.context.close().catch(() => {});
    await stop(proc);
  }
  if (memoryAfter) console.log(`  ${tool.id} memory after ${2 * (EDIT_WARMUP + EDITS)} edits: ${mb(memoryAfter.afterEdits)} (peak ${mb(memoryAfter.peak)})`);
  // vite-plugin-ngp logs each background type-check with its duration; keep them.
  const typeChecks = [...proc.output().matchAll(/type-check: [^(\n]*\((\d+) ms\)/g)].map((m) => Number(m[1]));
  if (typeChecks.length) console.log(`  ${tool.id} type-checks during the session: ${typeChecks.join(', ')} ms`);
  if (errors.length) console.log(`  ${tool.id} edit: FAILED\n    ${errors.join('\n    ').slice(0, 2000)}`);
  if (!app.ts) record(app, tool, 'edit-ts', {ok: false, unsupported: app.pin?.tsNotes ?? 'has no .ts edit target', memory: memoryAfter});
  for (const kind of app.ts ? ['template', 'ts'] : ['template']) {
    const s = out[kind];
    const modes = [...new Set(s.map((x) => x.mode))];
    record(app, tool, `edit-${kind}`, {
      ok: errors.length === 0,
      errors,
      samples: s,
      latency: summarize(s.map((x) => x.ms)),
      mode: modes.length === 1 ? modes[0] : modes.join('+'),
      typeChecks,
      memory: memoryAfter,
    });
  }
}

// ---------------------------------------------------------------------------------------------

/**
 * How long a template type error takes to show up in the dev server's terminal, and how long the
 * fix takes to clear it. Only for the tools that type-check in dev.
 */
const TYPECHECK = {
  // vite-plugin-ngp logs a check when its result changes: the error, then "no errors".
  ngp: {clean: /type-check: no errors/},
  // The CLI rebuilds with type-checking; a clean rebuild ends with this line. Nx runs the CLI.
  cli: {clean: /Application bundle generation complete/},
  nx: {clean: /Application bundle generation complete/},
};

async function typecheckSeries(app, tool) {
  if (!TYPECHECK[tool.id]) return;
  const url = devUrl(app, tool);
  const proc = start(tool.dev(app, PORT), app.dir);
  const file = path.join(app.dir, app.template);
  const original = fs.readFileSync(file, 'utf8');
  const out = {error: [], clean: []};
  const errors = [];
  let opened;
  try {
    await waitForHttp(url, proc, 600_000, app.rootTag);
    opened = await openApp(browser, url, app.gate, {ignoreHttp: app.ignoreHttp});
    pendingRestores.set(file, original);
    for (let i = 0; i < EDIT_WARMUP + EDITS; i++) {
      const missing = `benchMissing${i}`;
      // The error has to name the planted property, so a stale report can't count.
      let t0 = Date.now();
      fs.writeFileSync(file, `${original}\n<p>{{ ${missing} }}</p>\n`);
      const reported = await proc.waitForLine(new RegExp(missing), t0, 300_000);
      const errorMs = reported - t0;
      await sleep(500);
      t0 = Date.now();
      fs.writeFileSync(file, original);
      const cleared = await proc.waitForLine(TYPECHECK[tool.id].clean, t0, 300_000);
      const cleanMs = cleared - t0;
      if (i >= EDIT_WARMUP) {
        out.error.push(errorMs);
        out.clean.push(cleanMs);
      }
      console.log(`  ${tool.id} typecheck ${i < EDIT_WARMUP ? 'warm-up' : `#${i - EDIT_WARMUP + 1}`}: error reported in ${fmt(errorMs)}, cleared in ${fmt(cleanMs)}`);
      await sleep(1000);
    }
  } catch (e) {
    errors.push(`${e.message}\n${proc.output().slice(-3000)}`);
    console.log(`  ${tool.id} typecheck: FAILED\n    ${errors[0].slice(0, 2000)}`);
  } finally {
    restoreAll();
    await opened?.context.close().catch(() => {});
    await stop(proc);
  }
  record(app, tool, 'typecheck', {
    ok: errors.length === 0,
    errors,
    samples: out.error.map((ms, i) => ({error: ms, clean: out.clean[i]})),
    error: summarize(out.error),
    clean: summarize(out.clean),
  });
}

// ---------------------------------------------------------------------------------------------

async function buildSeries(app, active) {
  const samples = new Map(active.map((t) => [t.id, []]));
  const failed = new Map();
  for (let round = 0; round < WARMUP + RUNS; round++) {
    for (const tool of active) {
      if (failed.has(tool.id)) continue;
      rmCaches(tool, app);
      fs.rmSync(tool.outDir(app), {recursive: true, force: true});
      const load = await waitForQuiet(MAX_LOAD);
      let memory;
      const r = await run(tool.build(app), app.dir, (proc) => (memory = sampleMemory(proc.child.pid)));
      const {peak} = memory.stop();
      if (r.code !== 0 || !fs.existsSync(path.join(tool.outDir(app), 'index.html'))) {
        failed.set(tool.id, [`build exited ${r.code}\n${r.output.slice(-3000)}`]);
        console.log(`  ${tool.id} build: FAILED (exit ${r.code})\n${r.output.slice(-1500)}`);
        continue;
      }
      const warm = round < WARMUP;
      if (!warm) samples.get(tool.id).push({ms: r.ms, load, memory: {peak: peak.rss, peakProcesses: peak.processes}});
      console.log(`  ${tool.id} build ${warm ? 'warm-up' : `#${round - WARMUP + 1}`}: ${fmt(r.ms)} (memory ${mb(peak.rss)} peak over ${peak.processes} processes, load ${load[0]})`);
    }
  }
  for (const tool of active) {
    let boot = null;
    let sizes = null;
    const errors = failed.get(tool.id) ?? [];
    if (!failed.has(tool.id)) {
      const dir = tool.outDir(app);
      const server = await serveStatic(dir, {base: app.paths[tool.id]?.build ?? '/', proxy: stubProxy(app)});
      try {
        const opened = await openApp(browser, server.url, app.gate, {timeoutMs: 60_000, ignoreHttp: app.ignoreHttp});
        // Then a lazy route, through the router like a user would get there: the link to it if
        // the page has one, else the browser's own navigation, which Angular's router listens to.
        await opened.page.evaluate((p) => {
          const a = document.querySelector(`a[href$="/${p}"]`);
          if (a) return a.click();
          history.pushState({}, '', new URL(p, document.baseURI).pathname);
          dispatchEvent(new PopStateEvent('popstate', {state: {}}));
        }, app.lazy.path);
        await opened.page.waitForFunction(app.lazy.gate, {polling: 'mutation', timeout: 60_000});
        await sleep(500);
        boot = {errors: opened.errors, lazyRoute: app.lazy.path};
        errors.push(...opened.errors.map((e) => `boot: ${e}`));
        await opened.context.close();
      } catch (e) {
        errors.push(`boot: ${e.message}`);
      } finally {
        await server.close();
      }
      sizes = bundleSizes(dir);
      const kb = (b) => `${(b / 1024).toFixed(0)} kB`;
      console.log(`  ${tool.id} build output: JS ${kb(sizes.total.js.raw)} (${kb(sizes.total.js.gzip)} gzip), initial JS ${kb(sizes.initial.js.raw)} (${kb(sizes.initial.js.gzip)} gzip), boot ${errors.length ? 'FAILED' : 'ok'}`);
    }
    const s = samples.get(tool.id);
    record(app, tool, 'build', {
      ok: errors.length === 0,
      errors,
      samples: s,
      time: summarize(s.map((x) => x.ms)),
      memoryPeak: summarize(s.map((x) => x.memory.peak)),
      boot,
      sizes,
    });
  }
}

// ---------------------------------------------------------------------------------------------

try {
  for (const app of apps) {
    const active = [];
    for (const tool of tools) {
      // A real app runs under its own CLI, so the other CLI isn't a result, just not this app's.
      if (app.kind === 'real' && (tool.id === 'cli' || tool.id === 'nx') && tool.id !== app.ownTool.id) continue;
      // Nothing generated runs under Nx.
      if (app.kind !== 'real' && tool.id === 'nx') continue;
      if (app.unsupported[tool.id]) {
        for (const metric of metrics) record(app, tool, metric, {ok: false, unsupported: app.unsupported[tool.id]});
        console.log(`${app.id} / ${tool.id}: not run, ${app.unsupported[tool.id]}`);
      } else active.push(tool);
    }
    const before = hashSources(app.dir, app.sourceDirs);
    console.log(`${app.id} (${app.components} components)`);
    // A real app may need a stub for the API it talks to; it runs for the whole app.
    const stub = app.stub ? start({cmd: process.execPath, args: [path.join(app.dir, app.stub.script), String(app.stub.port)]}, app.dir) : null;
    if (stub) await sleep(500);
    try {
      for (const metric of metrics) {
        if (metric === 'dev-cold' || metric === 'dev-warm') await devSeries(app, active, metric);
        else if (metric === 'edit') for (const tool of active) await editSeries(app, tool);
        else if (metric === 'build') await buildSeries(app, active);
        else if (metric === 'typecheck') for (const tool of active) await typecheckSeries(app, tool);
        else throw new Error(`unknown metric ${metric}`);
      }
    } finally {
      if (stub) await stop(stub);
    }
    const after = hashSources(app.dir, app.sourceDirs);
    if (before !== after) throw new Error(`${app.id}: sources changed during the run`);
  }
} finally {
  restoreAll();
  await browser.close();
  save();
}
console.log(`done: ${path.relative(process.cwd(), outFile)}`);
