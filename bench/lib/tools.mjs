// The four toolchains, each as its documented default setup. Every one runs from bench/node_modules
// with the same Angular (22.3.0-next.2) and, for the Vite-based three, the same Vite (8.3.4).

import * as fs from 'node:fs';
import * as path from 'node:path';
import {BENCH} from './apps.mjs';

const NM = path.join(BENCH, 'node_modules');
const NG = path.join(NM, '@angular/cli/bin/ng.js');
const VITE = path.join(NM, 'vite/bin/vite.js');

/**
 * Vite configs, written into each app as vite.config.<tool>.mjs. Each one is the plugin's README
 * setup and nothing else, plus a per-tool cache and output directory so the tools never share a
 * dependency cache or overwrite each other's builds.
 */
export const VITE_CONFIGS = {
  ngp: `import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

// vite-plugin-ngp's documented setup. The toolchain comes from NGP_TOOLCHAIN.
export default defineConfig({
  cacheDir: 'node_modules/.vite-ngp',
  build: {outDir: 'dist-ngp'},
  plugins: [ngp()],
});
`,
  analog: `import {defineConfig} from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// @analogjs/vite-plugin-angular's README setup: the default (full ngtsc) path, not fastCompile.
export default defineConfig({
  cacheDir: 'node_modules/.vite-analog',
  build: {outDir: 'dist-analog'},
  resolve: {mainFields: ['module']},
  plugins: [angular()],
});
`,
  // Not a default: Analog's component HMR is opt-in. Measured only to show what turning it on buys.
  'analog-hmr': `import {defineConfig} from 'vite';
import angular from '@analogjs/vite-plugin-angular';

// Analog's README setup plus liveReload: true, its opt-in component HMR.
export default defineConfig({
  cacheDir: 'node_modules/.vite-analog-hmr',
  build: {outDir: 'dist-analog-hmr'},
  resolve: {mainFields: ['module']},
  plugins: [angular({liveReload: true})],
});
`,
  oxc: `import {defineConfig} from 'vite';
import {angular} from '@oxc-angular/vite';

// @oxc-angular/vite's README setup.
export default defineConfig({
  cacheDir: 'node_modules/.vite-oxc',
  build: {outDir: 'dist-oxc'},
  plugins: [angular()],
});
`,
};

function viteTool(id, label, pkg) {
  return {
    id,
    label,
    pkg,
    dev: (app, port) => ({
      cmd: process.execPath,
      args: [VITE, '--config', `vite.config.${id}.mjs`, '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    }),
    build: () => ({cmd: process.execPath, args: [VITE, 'build', '--config', `vite.config.${id}.mjs`]}),
    outDir: (app) => path.join(app.dir, `dist-${id}`),
    caches: (app) => [path.join(app.dir, `node_modules/.vite-${id}`)],
  };
}

export const TOOLS = {
  ngp: viteTool('ngp', 'vite-plugin-ngp', 'vite-plugin-ngp'),
  cli: {
    id: 'cli',
    label: 'Angular CLI',
    pkg: '@angular/build',
    // `ng serve` and `ng build` as `ng new` configures them: development for serve, production
    // for build, the CLI's persistent cache on.
    dev: (app, port) => ({cmd: process.execPath, args: [NG, 'serve', '--host', '127.0.0.1', '--port', String(port)]}),
    build: () => ({cmd: process.execPath, args: [NG, 'build']}),
    outDir: (app) => path.join(app.dir, 'dist', projectName(app), 'browser'),
    caches: (app) => [path.join(app.dir, '.angular')],
  },
  analog: viteTool('analog', 'Analog', '@analogjs/vite-plugin-angular'),
  oxc: viteTool('oxc', '@oxc-angular/vite', '@oxc-angular/vite'),
  'analog-hmr': viteTool('analog-hmr', 'Analog, liveReload on', '@analogjs/vite-plugin-angular'),
};

function projectName(app) {
  const ng = JSON.parse(fs.readFileSync(path.join(app.dir, 'angular.json'), 'utf8'));
  return Object.keys(ng.projects)[0];
}
