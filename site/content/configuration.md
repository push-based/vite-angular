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
      typeCheck: true,
    }),
  ],
});
```

## Options

| Option | Default | What it does |
|---|---|---|
| `toolchain` | `NGP_TOOLCHAIN` | The directory `pnpm toolchain` builds ngp into, holding `preprocessor/` and `engines/`. Without it, or the environment variable, the plugin stops with an error. |
| `engine` | `'native'` | Which build of ngp's analyzer to load: the native Node addon, or `'wasm'`. There's no automatic fallback. |
| `tsconfig` | `tsconfig.app.json`, else `tsconfig.json`. Under Vitest, `tsconfig.spec.json` first | The tsconfig your Angular compiler options come from, relative to Vite's root. |
| `entries` | `src/main.ts`, plus `src/main.server.ts` if it exists. Under Vitest, none | The modules the analyzer starts from. It finds every other file by following imports. |
| `entryOnlyTsconfig` | `true` | Give the analyzer a generated tsconfig that lists only `entries`. |
| `hmr` | `true` | Component HMR in the dev server, for external templates and for inline `template` and `styles` edits. Builds and Vitest ignore it. |
| `ssr` | `false` | Server rendering. `true` uses `src/main.server.ts` as the server entry, and `{entry: 'path'}` names another. Vitest ignores it. See [Server rendering](server-rendering). |
| `typeCheck` | `true`, except under Vitest | Type-check templates and TypeScript with TypeScript 7, in a separate process. The dev server reports errors in the terminal and the overlay, and `vite build` fails on them. See [Type-checking](type-checking). |

## When to change them

**`engine: 'wasm'`** is for platforms without a native build. It works everywhere, but the analyzer runs single-threaded. On a real app it took up to twice as long as native, which is why the plugin never switches to it on its own.

**`entries`** needs every module that nothing else imports: a second entry point, or a server entry with another name. Files no entry reaches, directly or through imports, are invisible to the analyzer.

**`entryOnlyTsconfig: false`** makes the analyzer read your tsconfig as it is. Use it if a file the analyzer should see isn't reachable from `entries`. Expect edits to get slower as the app grows: about 172 ms per edit at 5,000 components, against 1 ms.

**`ssr: true`** renders every page on the server in the dev server, and makes `vite build` build two bundles: `dist/client` for the browser and `dist/server/main.server.js` for the server. The entry's default export must be `render(url, document)`.

**`typeCheck: false`** skips the check in the dev server and in builds. Use it if you already run `tsc` or `ng build` in CI and the dev-server check is too slow on your app, or if your `cacheDir` is outside the project. Builds then succeed with type errors in them.

**`hmr: false`** makes every edit reload the page. Use it if an in-place update ever leaves a component in a broken state, and tell the maintainers at [PushBased](https://push-based.io/) what you edited.

## What the plugin sets for you

You don't configure these, but they're worth knowing when you debug:

- `define`: `ngJitMode`, `ngDevMode`, `ngServerMode` and `ngHmrMode`, as [How it works](how-it-works) lists.
- `optimizeDeps.rolldownOptions.plugins`: Angular's linker, for dependency pre-bundling.
- `build.rolldownOptions.treeshake.manualPureFunctions`: `forwardRef`, so unused `forwardRef(...)` calls can be dropped, as `ng build` does. The rest of the build optimizer is a transform and needs no configuration.
- `resolve.noExternal` in server environments: every `@angular/*` package, plus every package in your `dependencies` that depends on `@angular/core`, so Angular libraries get bundled and linked instead of loaded unlinked by Node. An Angular library under `devDependencies` stays external; add it to `resolve.noExternal` yourself.
- A dev-server middleware that answers `/@ng/component` requests with component updates.
- With `typeCheck`: a `vite-plugin-ngp/type-check` folder in Vite's cache directory, holding the type-check blocks, the check's tsconfig and its incremental build info. In the dev server, a script tag in `index.html` loads `/@ngp/type-check-client.js`, which shows type errors in Vite's overlay. It's left out when `server.hmr.overlay` is `false`.
- A resolver for component stylesheet names in the dev server, like `card.ngp-de07cd19.css`, and a transform that scopes component stylesheets after Vite's CSS plugin has compiled them. See [Component styles](styles).
- With `ssr`: `builder: {}` and output directories for the `client` and `ssr` environments, and a middleware that renders page requests through your server entry.
- Under Vitest, instead of all of the above except the linker: `test.server.deps.inline` with every Angular library, from `devDependencies` too, so they get linked; a cache key generator that keeps your app's modules out of Vitest's module cache; and a watcher that sends edits to the analyzer, since Vitest turns Vite's HMR off. See [Testing with Vitest](testing).
- `DEBUG=vite-plugin-ngp` logs every module ngp compiles, and how long it took, to stderr.
