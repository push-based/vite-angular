// Sets up a real open-source Angular app for the benchmark, in .work/real.noindex/<name> (or
// $REAL_DIR/<name>). It does what a developer trying the plugin on that app would do:
//
// 1. Fetches the commit pinned in real/<name>.json, shallow.
// 2. Pins every @angular/* framework and CLI package to that file's `angularVersion`, the version
//    the ngp toolchain is built from, so the app's own CLI and the plugin see the same Angular.
// 3. Runs the app's install command, with its own lockfile and prepare scripts.
// 4. Applies real/<name>.patch if there is one, then writes a root index.html and copies the files
//    in real/shared/ and real/<name>/ into the app: vite.config.ngp.mjs for the plugin, the helpers
//    it imports, and whatever else that app needs (Ghostfolio: a stub API). The app's own files
//    are never changed beyond the patch.
// 5. Writes bench.json next to them: the pin, a component count, and a SHA-256 over the sources
//    so the harness can check a run left them alone.
//
// Usage: node real.mjs <name> [--skip-install]

import {execFileSync, execSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {parseArgs} from 'node:util';
import {BENCH, REAL_DIR, hashSources} from './lib/apps.mjs';

const {values: args, positionals} = parseArgs({allowPositionals: true, options: {'skip-install': {type: 'boolean', default: false}}});
const name = positionals[0];
if (!name) throw new Error('Usage: node real.mjs <name> [--skip-install]');

const pinFile = path.join(BENCH, 'real', `${name}.json`);
const pin = JSON.parse(fs.readFileSync(pinFile, 'utf8'));
const dest = path.join(REAL_DIR, name);
const sh = (cmd, cwd = dest) => {
  console.log(`$ ${cmd}`);
  execSync(cmd, {cwd, stdio: 'inherit', env: {...process.env, HUSKY: '0', CI: 'true', NG_CLI_ANALYTICS: 'false', NX_DAEMON: 'false'}});
};

if (!args['skip-install']) {
  fs.rmSync(dest, {recursive: true, force: true});
  fs.mkdirSync(dest, {recursive: true});
  sh('git init -q');
  sh(`git remote add origin ${pin.repo}`);
  sh(`git fetch -q --depth 1 origin ${pin.sha}`);
  sh('git -c advice.detachedHead=false checkout -q FETCH_HEAD');

  const pkgPath = path.join(dest, 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const pinned = [];
  for (const field of ['dependencies', 'devDependencies']) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (/^@angular\/(?!.*eslint)/.test(dep) || dep === '@angular-devkit/build-angular') {
        pkg[field][dep] = pin.angularVersion;
        pinned.push(dep);
      }
    }
  }
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`pinned ${pinned.length} packages to ${pin.angularVersion}: ${pinned.join(', ')}`);
  for (const cmd of pin.install) sh(cmd);
}

// A patch to the app's sources, when one is needed to compile it on both sides. real/<name>.patch
// says why in its header; the docs list every patch. Applied once; a rerun sees it in place.
const patch = path.join(BENCH, 'real', `${name}.patch`);
if (fs.existsSync(patch)) {
  const check = (flags) => {
    try {
      execFileSync('git', ['apply', '--check', ...flags, patch], {cwd: dest, stdio: 'ignore'});
      return true;
    } catch {
      return false;
    }
  };
  if (check([])) sh(`git apply ${JSON.stringify(patch)}`);
  else if (!check(['--reverse'])) throw new Error(`${patch} applies neither forwards nor backwards`);
} else if (!fs.existsSync(path.join(dest, 'package.json'))) {
  throw new Error(`${dest} isn't set up; run without --skip-install first`);
}

// What the plugin needs. First a root index.html: the app's own index.html plus the two things
// its CLI injects from its build config, the global stylesheets and the entry module, as a Vite
// user would write it. Then the files in real/<name>/: vite.config.ngp.mjs and any helper.
{
  let html = fs.readFileSync(path.join(dest, pin.index.from), 'utf8');
  const links = pin.index.styles.map((s) => `  <link rel="stylesheet" href="/${s}" />\n`).join('');
  html = html.replace(/\s*<\/head>/, `\n${links}  </head>`);
  html = html.replace(/\s*<\/body>/, `\n    <script type="module" src="/${pin.index.entry}"></script>\n  </body>`);
  fs.writeFileSync(path.join(dest, 'index.html'), html);
}
const added = ['index.html'];
for (const extras of [path.join(BENCH, 'real/shared'), path.join(BENCH, 'real', name)]) {
  if (!fs.existsSync(extras)) continue;
  for (const entry of fs.readdirSync(extras)) {
    fs.cpSync(path.join(extras, entry), path.join(dest, entry), {recursive: true});
    added.push(entry);
  }
}
// The plugin comes from bench/node_modules, linked into the app's node_modules under its own name.
// The app's own packages stay as they are; `vite` is linked only when the app doesn't have it.
for (const dep of ['@push-based/vite-plugin-ngp', 'vite']) {
  const target = path.join(dest, 'node_modules', dep);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  if (dep === 'vite' && fs.existsSync(target) && !fs.lstatSync(target).isSymbolicLink()) continue;
  fs.rmSync(target, {recursive: true, force: true});
  fs.symlinkSync(path.join(BENCH, 'node_modules', dep), target, 'dir');
}

const components = countComponents(dest, pin.sourceDirs);
const bench = {
  ...pin,
  dir: path.relative(BENCH, dest),
  components,
  added,
  sources: hashSources(dest, pin.sourceDirs),
  fetchedAt: new Date().toISOString(),
};
fs.writeFileSync(path.join(dest, 'bench.json'), JSON.stringify(bench, null, 2) + '\n');
console.log(`${name}: ${components} components -> ${path.relative(process.cwd(), dest)}`);

/** Counts `@Component(` in the app's own .ts sources, excluding specs. */
function countComponents(dir, sourceDirs) {
  let n = 0;
  const walk = (d) => {
    for (const e of fs.readdirSync(d, {withFileTypes: true})) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') && !e.name.endsWith('.d.ts')) {
        n += fs.readFileSync(p, 'utf8').match(/@Component\s*\(/g)?.length ?? 0;
      }
    }
  };
  for (const s of sourceDirs) if (fs.existsSync(path.join(dir, s))) walk(path.join(dir, s));
  return n;
}
