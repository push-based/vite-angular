---
title: Configuration
description: Every option vite-plugin-ngp accepts, its default, and when to change it.
---

# Configuration

`ngp()` takes one options object. Most apps only set `toolchain`.

```ts
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [
    ngp({
      toolchain: '../vite-angular/toolchain/out',
      engine: 'native',
      tsconfig: 'tsconfig.app.json',
      entries: ['src/main.ts'],
      entryOnlyTsconfig: true,
      hmr: true,
      ssr: false,
    }),
  ],
});
```

## Options

| Option | Default | What it does |
|---|---|---|
| `toolchain` | `NGP_TOOLCHAIN` | The directory `pnpm toolchain` builds ngp into, holding `preprocessor/` and `engines/`. Without it, or the environment variable, the plugin stops with an error. |
| `engine` | `'native'` | Which build of ngp's analyzer to load: the native Node addon, or `'wasm'`. There's no automatic fallback. |
| `tsconfig` | `tsconfig.app.json`, else `tsconfig.json` | The tsconfig your Angular compiler options come from, relative to Vite's root. |
| `entries` | `src/main.ts`, plus `src/main.server.ts` if it exists | The modules the analyzer starts from. It finds every other file by following imports. |
| `entryOnlyTsconfig` | `true` | Give the analyzer a generated tsconfig that lists only `entries`. |
| `hmr` | `true` | Component HMR for external templates in the dev server. Builds ignore it. |
| `ssr` | `false` | Server rendering. `true` uses `src/main.server.ts` as the server entry, and `{entry: 'path'}` names another. See [Server rendering](server-rendering). |

## When to change them

**`engine: 'wasm'`** is for platforms without a native build. It works everywhere, but the analyzer runs single-threaded. On a real app it took up to twice as long as native, which is why the plugin never switches to it on its own.

**`entries`** needs every module that nothing else imports: a second entry point, or a server entry with another name. Files no entry reaches, directly or through imports, are invisible to the analyzer.

**`entryOnlyTsconfig: false`** makes the analyzer read your tsconfig as it is. Use it if a file the analyzer should see isn't reachable from `entries`. Expect edits to get slower as the app grows: about 172 ms per edit at 5,000 components, against 1 ms.

**`ssr: true`** renders every page on the server in the dev server, and makes `vite build` build two bundles: `dist/client` for the browser and `dist/server/main.server.js` for the server. The entry's default export must be `render(url, document)`.

**`hmr: false`** makes every edit reload the page. Use it if an in-place update ever leaves a component in a broken state, and [report it](https://github.com/push-based/vite-angular/issues).

## What the plugin sets for you

You don't configure these, but they're worth knowing when you debug:

- `define`: `ngJitMode`, `ngDevMode`, `ngServerMode` and `ngHmrMode`, as [How it works](how-it-works) lists.
- `optimizeDeps.rolldownOptions.plugins`: Angular's linker, for dependency pre-bundling.
- `resolve.noExternal` in server environments: every `@angular/*` package, plus every package in your `dependencies` that depends on `@angular/core`, so Angular libraries get bundled and linked instead of loaded unlinked by Node. An Angular library under `devDependencies` stays external; add it to `resolve.noExternal` yourself.
- A dev-server middleware that answers `/@ng/component` requests with component updates.
- With `ssr`: `builder: {}` and output directories for the `client` and `ssr` environments, and a middleware that renders page requests through your server entry.
