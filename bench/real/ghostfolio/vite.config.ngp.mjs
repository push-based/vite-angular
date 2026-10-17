import * as fs from 'node:fs';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';
import {angularServiceWorker} from './bench-ngsw.mjs';

// vite-plugin-ngp on Ghostfolio's Nx client (apps/client), written the way the plugin's docs say
// to move an app off its CLI: the build options from apps/client/project.json become plugin
// options or Vite config, and nothing in the app changes.
//
// - tsconfig.base.json's path aliases (@ghostfolio/common/*, @ghostfolio/ui/*, ...) become Vite
//   aliases, below. Vite doesn't read tsconfig paths; ngp's analyzer does.
// - The 13 locales from project.json's i18n block become the plugin's i18n option, so `vite build`
//   writes one folder per locale like `nx build` does with localize: true.
// - /api and /assets go to the bench's stub API (bench/real/ghostfolio/api-stub.mjs), the same
//   way apps/client/proxy.conf.json sends them to the real API under `nx serve`.
// - project.json's serviceWorker: true has no plugin option. bench-ngsw.mjs runs Angular's
//   ngsw-config over each locale's folder after the build, as nx build does.

const LOCALES = ['ca', 'de', 'es', 'fr', 'it', 'ja', 'ko', 'nl', 'pl', 'pt', 'tr', 'uk', 'zh'];
// The app's root, whatever the working directory: Vite keeps import.meta.url pointing at this file.
const here = path.dirname(fileURLToPath(import.meta.url));
const PROXY = {'/api': 'http://127.0.0.1:3333', '/assets': 'http://127.0.0.1:3333'};

/** tsconfig `paths` as Vite aliases: `@x/*` -> `./libs/x/*` becomes a regex alias, exact names a plain one. */
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

export default defineConfig(({mode}) => ({
  cacheDir: 'node_modules/.vite-ngp',
  build: {outDir: 'dist-ngp'},
  // quietDeps: Bootstrap's Sass prints about 200 deprecation warnings per compile otherwise.
  css: {preprocessorOptions: {scss: {quietDeps: true}}},
  resolve: {alias: tsconfigPathsAlias(path.join(here, 'tsconfig.base.json'))},
  // tsconfig.base.json has emitDecoratorMetadata: true, a leftover Angular stopped needing years
  // ago. Vite's per-file transform honours it and emits `design:paramtypes` naming parameter
  // types at runtime; types that are interfaces then survive as imports of nothing and the module
  // fails to load. `nx build` has the whole program and writes `Object` for them. Angular needs
  // no decorator metadata, so: off. TypeScript's own check for this is TS1272.
  oxc: {decorator: {legacy: true, emitDecoratorMetadata: false}},
  server: {proxy: PROXY},
  preview: {proxy: PROXY},
  plugins: [
    angularServiceWorker({root: here, config: 'apps/client/ngsw-config.json', localized: true}),
    ngp({
      tsconfig: 'apps/client/tsconfig.app.json',
      entries: ['apps/client/src/main.ts'],
      polyfills: ['apps/client/src/polyfills.ts'],
      fileReplacements:
        mode === 'production'
          ? [{replace: 'apps/client/src/environments/environment.ts', with: 'apps/client/src/environments/environment.prod.ts'}]
          : [],
      budgets: [
        {type: 'initial', maximumWarning: '2mb', maximumError: '5mb'},
        {type: 'anyComponentStyle', maximumWarning: '6kb', maximumError: '10kb'},
      ],
      i18n: {
        sourceLocale: 'en',
        locales: Object.fromEntries(LOCALES.map((l) => [l, `apps/client/src/locales/messages.${l}.xlf`])),
        devLocale: 'en',
      },
    }),
  ],
}));
