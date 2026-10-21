import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import {ngp} from '@push-based/vite-plugin-ngp';
import {angularServiceWorker} from './bench-ngsw.mjs';
import {typiaTransform} from './bench-typia.mjs';

// vite-plugin-ngp on Super Productivity, written the way the plugin's docs say to move an app
// off ng build: angular.json's production build options become plugin options or Vite config,
// and nothing in the app changes (one two-line patch aside; see ../super-productivity.patch).
//
// - tsconfig.base.json's `paths` (src/*, @sp/*, @super-productivity/plugin-api) become Vite
//   aliases, below. Vite doesn't read tsconfig paths; ngp's analyzer does.
// - preserveSymlinks mirrors angular.json's, for the npm-workspace packages under packages/.
// - stylePreprocessorOptions.includePaths becomes scss loadPaths.
// - angular.json's `assets` list has no Vite equivalent beyond public/, so the small plugin
//   below serves and copies them: src/assets -> /assets, src/static -> /static, and two files.
// - marked-katex-extension isn't installed and angular.json leaves it external; a stub takes its
//   place (bench-stubs/).
// - angular.json's serviceWorker has no plugin option. bench-ngsw.mjs runs Angular's ngsw-config
//   over the output after the build, as ng build does.
// - emitDecoratorMetadata is turned off for Vite's transform; see the `oxc` option below.
// - tsconfig.base.json's `plugins: [{transform: 'typia/lib/transform'}]` is a ts-patch
//   transformer, which nothing on the Vite side runs. bench-typia.mjs runs it, over a TypeScript
//   program, the way unplugin-typia would.

// The app's root, whatever the working directory: Vite keeps import.meta.url pointing at this file.
const here = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = ['src/favicon.ico', 'src/assets', 'src/manifest.json', 'src/static'].map((a) => path.join(here, a));

/** tsconfig `paths` as Vite aliases: `src/*` -> `./src/*` becomes a regex alias, exact names a plain one. */
function tsconfigPathsAlias(tsconfigFile) {
  const {compilerOptions} = JSON.parse(fs.readFileSync(tsconfigFile, 'utf8'));
  const base = path.dirname(path.resolve(tsconfigFile));
  return Object.entries(compilerOptions.paths).map(([from, [to]]) => {
    const target = path.resolve(base, to);
    return from.endsWith('/*')
      ? {find: new RegExp(`^${from.slice(0, -2).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/(.*)$`), replacement: `${target.slice(0, -2)}/$1`}
      : {find: from, replacement: target};
  });
}

/** angular.json's `assets`: serve each entry under its basename in dev, copy it into the build. */
function angularAssets(entries) {
  const map = entries.map((e) => ({from: e, at: '/' + path.basename(e), dir: fs.statSync(e).isDirectory()}));
  return {
    name: 'bench:angular-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://localhost').pathname;
        for (const m of map) {
          const file = m.dir
            ? url.startsWith(m.at + '/')
              ? path.join(m.from, decodeURIComponent(url.slice(m.at.length + 1)))
              : null
            : url === m.at
              ? m.from
              : null;
          if (file && file.startsWith(m.from) && fs.existsSync(file) && fs.statSync(file).isFile()) {
            res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
            return fs.createReadStream(file).pipe(res);
          }
        }
        next();
      });
    },
    writeBundle(options) {
      for (const m of map) fs.cpSync(m.from, path.join(options.dir, path.basename(m.from)), {recursive: true});
    },
  };
}
const TYPES = {'.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.woff': 'font/woff', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.xml': 'application/xml', '.txt': 'text/plain', '.md': 'text/markdown', '.mp3': 'audio/mpeg', '.html': 'text/html'};

export default defineConfig(({mode}) => ({
  cacheDir: 'node_modules/.vite-ngp',
  // Two component stylesheets write `@media (min-width: var(--layout-xs))`, which isn't CSS: a
  // media query can't read a custom property. Sass and the CLI's esbuild minifier pass it through
  // unchanged, and the browser ignores the rule. Vite's default minifier, lightningcss, rejects
  // it and fails the build, so this uses esbuild's, as the CLI does.
  build: {outDir: 'dist-ngp', cssMinify: 'esbuild'},
  resolve: {
    preserveSymlinks: true,
    alias: [
      ...tsconfigPathsAlias(path.join(here, 'tsconfig.base.json')),
      {find: 'marked-katex-extension', replacement: path.join(here, 'bench-stubs/marked-katex-extension.mjs')},
    ],
  },
  // tsconfig.base.json has emitDecoratorMetadata: true, a leftover Angular stopped needing years
  // ago. Vite's per-file transform honours it and, for the app's own `@debounce()` method
  // decorators, emits `design:paramtypes` that name parameter types at runtime. Types that are
  // interfaces then survive as imports of nothing, and the page fails to load. ng build has the
  // whole program and writes `Object` for them. Angular needs no decorator metadata, so: off.
  oxc: {decorator: {legacy: true, emitDecoratorMetadata: false}},
  css: {preprocessorOptions: {scss: {loadPaths: ['.', 'src', 'src/styles'].map((p) => path.join(here, p)), quietDeps: true}}},
  plugins: [
    typiaTransform({root: here, tsconfig: 'src/tsconfig.app.json'}),
    angularAssets(ASSETS),
    angularServiceWorker({root: here, config: 'ngsw-config.json'}),
    ngp({
      tsconfig: 'src/tsconfig.app.json',
      polyfills: ['src/polyfills.ts'],
      fileReplacements:
        mode === 'production' ? [{replace: 'src/environments/environment.ts', with: 'src/environments/environment.prod.ts'}] : [],
      budgets: [
        {type: 'initial', maximumWarning: '5.5mb', maximumError: '6mb'},
        {type: 'anyComponentStyle', maximumWarning: '20kb'},
      ],
    }),
  ],
}));
