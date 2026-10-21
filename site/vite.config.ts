import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {ngp} from '@push-based/vite-plugin-ngp';
import {markdown} from './scripts/markdown';

// GitHub Pages serves the site from /vite-plugin-ngp/. SITE_BASE overrides it, for example '/'.
const base = process.env.SITE_BASE ?? '/vite-plugin-ngp/';
// Absolute URLs, for canonical links, social cards and the sitemap.
const siteUrl = (process.env.SITE_ORIGIN ?? 'https://push-based.github.io') + base;

// What the footer says the site was built from.
const pins = readFileSync(resolve(import.meta.dirname, '../toolchain/versions.env'), 'utf8');
const pin = (name: string) => new RegExp(`^${name}=(\\S+)`, 'm').exec(pins)?.[1] ?? '';
const build = {
  commit: (process.env.GITHUB_SHA ?? gitHead()).slice(0, 7),
  angular: pin('ANGULAR_NPM_VERSION'),
  ngpCommit: pin('ANGULAR_SHA'),
};

function gitHead(): string {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  base,
  define: {
    SITE_BASE: JSON.stringify(base),
    SITE_URL: JSON.stringify(siteUrl),
    SITE_BUILD: JSON.stringify(build),
  },
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
