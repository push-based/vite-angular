// Sets up the benchmark's apps in .work/apps: the generated apps at 100, 1,000 and 5,000
// components, and a copy of this repo's playground. Then adds what the Vite-based tools need
// next to each app's Angular CLI files: a root index.html and one vite.config.<tool>.mjs per tool.
//
// Usage: node apps.mjs [--sizes 100,1000,5000] [--seed 1]

import {execFileSync} from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {parseArgs} from 'node:util';
import {APPS_DIR, BENCH, GENERATED_SIZES, REPO, hashSources} from './lib/apps.mjs';
import {VITE_CONFIGS} from './lib/tools.mjs';

const {values: args} = parseArgs({
  options: {sizes: {type: 'string'}, seed: {type: 'string', default: '1'}},
});
const sizes = args.sizes ? args.sizes.split(',').map(Number) : GENERATED_SIZES;

fs.mkdirSync(APPS_DIR, {recursive: true});

for (const size of sizes) {
  execFileSync(process.execPath, [path.join(BENCH, 'corpus/generate.mjs'), '--components', String(size), '--seed', args.seed], {
    stdio: 'inherit',
  });
  const dir = path.join(APPS_DIR, `standalone-${size}-s${args.seed}`);
  // Vite serves index.html from the root. Same page as src/index.html, plus the two things the
  // CLI injects from angular.json: the global stylesheet and the entry module.
  const html = fs
    .readFileSync(path.join(dir, 'src/index.html'), 'utf8')
    .replace('</head>', '  <link rel="stylesheet" href="/src/styles.css" />\n  </head>')
    .replace('</body>', '  <script type="module" src="/src/main.ts"></script>\n  </body>');
  fs.writeFileSync(path.join(dir, 'index.html'), html);
  writeViteConfigs(dir);
}

// The playground, copied so the comparison tools resolve from bench/node_modules and the copy can
// be edited without touching the real one. Client-only: the playground's own config turns on SSR,
// which only vite-plugin-ngp offers in this form.
{
  const dir = path.join(APPS_DIR, 'playground');
  fs.rmSync(dir, {recursive: true, force: true});
  fs.mkdirSync(dir, {recursive: true});
  const from = path.join(REPO, 'playground');
  for (const entry of ['src', 'public', 'index.html', 'tsconfig.json', 'tsconfig.app.json']) {
    fs.cpSync(path.join(from, entry), path.join(dir, entry), {recursive: true});
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({name: 'playground-bench', private: true, type: 'module'}, null, 2) + '\n');
  writeViteConfigs(dir);
  const commit = execFileSync('git', ['-C', REPO, 'log', '-1', '--format=%h', '--', 'playground'], {encoding: 'utf8'}).trim();
  fs.writeFileSync(path.join(dir, 'source.json'), JSON.stringify({from: 'playground', commit, sources: hashSources(dir)}, null, 2) + '\n');
  console.log(`playground: copied from ${commit} -> ${path.relative(process.cwd(), dir)}`);
}

function writeViteConfigs(dir) {
  for (const [tool, config] of Object.entries(VITE_CONFIGS)) {
    fs.writeFileSync(path.join(dir, `vite.config.${tool}.mjs`), config);
  }
}
