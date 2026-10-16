---
title: Server rendering
description: Render Angular on the server with vite-plugin-ngp, in the dev server and in builds, and prerender a static site the way this one is.
---

# Server rendering

With `ssr: true`, the plugin renders every page on the server in the dev server, and `vite build` builds a server bundle next to the browser one. This site is the worked example: an Angular app compiled by vite-plugin-ngp, rendered to static HTML with Angular SSR at build time, and hydrated in the browser. This page shows how to set up the same for your app.

## Turn it on

```ts
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [ngp({ssr: true})],
});
```

`ssr: true` expects the server entry at `src/main.server.ts`. To use another file, write `ssr: {entry: 'src/server.ts'}`.

## The server entry

The entry renders one page. Its default export takes the URL and the contents of `index.html`, and resolves to the rendered HTML. This site's `src/main.server.ts`:

```ts title="src/main.server.ts"
import {mergeApplicationConfig} from '@angular/core';
import {bootstrapApplication, type BootstrapContext} from '@angular/platform-browser';
import {provideServerRendering, renderApplication} from '@angular/platform-server';
import {App} from './app/app';
import {appConfig} from './app/app.config';

const serverConfig = mergeApplicationConfig(appConfig, {providers: [provideServerRendering()]});

export default function render(url: string, document: string): Promise<string> {
  return renderApplication((context: BootstrapContext) => bootstrapApplication(App, serverConfig, context), {
    document,
    url,
    allowedHosts: ['localhost'],
  });
}
```

> [!IMPORTANT]
> `allowedHosts` matters: Angular refuses to render a URL whose host it hasn't been told to trust, with error `NG05706`. List the hosts your server answers for.

The browser side adds hydration, so Angular reuses the server's DOM instead of rendering the page again:

```ts
provideClientHydration(withEventReplay())
```

## What the plugin does

**In the dev server**, a middleware renders every page request through your entry, loaded by Vite's `ssr` environment. It passes the entry `index.html` as Vite transformed it, and returns the rendered page for the browser to hydrate. Edit a template and the browser updates in place, while the next server render shows the edit too.

**In server environments**, the plugin compiles your components with their own ngp compiler, without HMR code, because HMR code imports updates from URLs only a browser can load. It defines `ngServerMode` as `true`. It also bundles every Angular library into the server build and links it: `@angular/*`, plus every package in your `dependencies` that depends on `@angular/core`, such as Angular Material or NgRx. Vite usually leaves `node_modules` for Node to load, and Node would then load those libraries unlinked, which only works with the JIT compiler. An Angular library listed under `devDependencies` isn't found; add it to `resolve.noExternal` yourself.

**In `vite build`**, it builds both environments: the browser bundle into `dist/client`, and your entry into `dist/server/main.server.js`. Serving them is up to you, with any Node server that calls `render` for page requests and serves `dist/client` for everything else.

## Prerendering for static hosting

GitHub Pages serves files, not a Node server, so this site renders every route at build time instead. A short script imports the server bundle, renders each route into the built `index.html`, and writes the result where Pages expects it:

```ts
const template = await readFile('dist/client/index.html', 'utf8');
const {default: render, routes} = await import('./dist/server/main.server.js');

for (const route of routes) {
  const html = await render(`http://localhost/vite-angular/${route}`, template);
  await writeFile(`dist/client/${route}/index.html`, html);
}
```

`routes` is a named export from the same server entry. It comes from the list that builds the site's router and sidebar, so a new page gets prerendered without touching the script. The site also renders a `404.html`, which GitHub Pages serves for any unknown path. All eight pages render in under 30 ms each.

## Limits

- **No status codes.** `render` returns HTML only. Behind a Node server, a not-found page answers 200. Angular's way to set the status, `@angular/ssr`'s request and response tokens, isn't wired up.
- **No `@angular/ssr` features.** Per-route render modes and `AngularNodeAppEngine` aren't supported. You write the server, or the prerender loop, yourself.
- **Two analyzers in dev.** The browser and server compilers each hold an ngp analyzer, so SSR roughly doubles the dev server's analyzer memory.
