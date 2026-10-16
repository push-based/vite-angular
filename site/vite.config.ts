import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';
import {markdown} from './scripts/markdown';

// GitHub Pages serves the site from /vite-angular/. SITE_BASE overrides it, for example '/'.
const base = process.env.SITE_BASE ?? '/vite-angular/';

export default defineConfig({
  base,
  define: {SITE_BASE: JSON.stringify(base)},
  plugins: [
    markdown(),
    {name: 'site:base-href', transformIndexHtml: (html) => html.replace('%SITE_BASE%', base)},
    ngp({
      // ngp isn't on npm: `pnpm toolchain` in the repo root builds it into toolchain/out.
      toolchain: process.env.NGP_TOOLCHAIN ?? resolve(import.meta.dirname, '../toolchain/out'),
      // Renders pages on the server in dev. `vite build` builds dist/client and dist/server, and
      // scripts/prerender.mjs renders every route from dist/server into static HTML.
      ssr: true,
    }),
  ],
});
