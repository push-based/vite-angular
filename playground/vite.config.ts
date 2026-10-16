import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig(({mode}) => ({
  plugins: [
    ngp({
      // ngp isn't on npm: `pnpm toolchain` in the repo root builds it into toolchain/out.
      toolchain: process.env.NGP_TOOLCHAIN ?? resolve(import.meta.dirname, '../toolchain/out'),
      // Renders pages on the server with src/main.server.ts, in dev and in `vite build`.
      ssr: true,
      // angular.json's production configuration, moved over: the Overview page shows which
      // environment file was compiled.
      fileReplacements:
        mode === 'production' ? [{replace: 'src/environments/environment.ts', with: 'src/environments/environment.prod.ts'}] : [],
      // The budgets `ng new` generates.
      budgets: [
        {type: 'initial', maximumWarning: '500kB', maximumError: '1MB'},
        {type: 'anyComponentStyle', maximumWarning: '4kB', maximumError: '8kB'},
      ],
      // `vite build` writes dist/client/en-US and dist/client/de. The dev server serves one
      // locale: `NGP_LOCALE=de pnpm dev` for German.
      i18n: {
        sourceLocale: 'en-US',
        locales: {de: 'src/locale/messages.de.xlf'},
        devLocale: process.env.NGP_LOCALE,
      },
    }),
  ],
}));
