// The server entry. In dev, vite-plugin-ngp renders every page through it. For GitHub Pages,
// scripts/prerender.mjs imports the built version and renders every route to static HTML; the
// browser then hydrates it.
import {mergeApplicationConfig} from '@angular/core';
import {bootstrapApplication, type BootstrapContext} from '@angular/platform-browser';
import {provideServerRendering, renderApplication} from '@angular/platform-server';
import {App} from './app/app';
import {appConfig} from './app/app.config';
import {DOCS} from './app/docs';

const serverConfig = mergeApplicationConfig(appConfig, {providers: [provideServerRendering()]});

/** Every path to prerender, relative to the site's base. */
export const routes = ['', ...DOCS.map((d) => d.path)];

/** The docs pages, for the sitemap and llms.txt that scripts/prerender.mjs writes. */
export const docs = DOCS;

/** Renders one page: vite-plugin-ngp's `ssr` contract, (url, index.html) → HTML. */
export default function render(url: string, document: string): Promise<string> {
  return renderApplication((context: BootstrapContext) => bootstrapApplication(App, serverConfig, context), {
    document,
    url,
    // Angular only renders for hosts it's told to trust. The prerender script renders as localhost.
    allowedHosts: ['localhost'],
  });
}
