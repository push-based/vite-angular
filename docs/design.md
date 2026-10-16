# vite-plugin-ngp: design

vite-plugin-ngp lets Vite compile Angular one module at a time, using ngp, the Rust-and-TypeScript preprocessor the Angular team merged on 8 October 2026. Vite owns the module graph, hands each `.ts` file to the plugin as the browser asks for it, and gets back ngp's TypeScript with a source map. No whole-program compile happens first.

This page is for whoever builds or reviews the plugin next. It covers why the plugin exists, how it works today, what it doesn't do yet, and where the design is weakest. The evidence behind each choice lives in [ng-hybrid-preprocessor-bench](https://github.com/push-based/ng-hybrid-preprocessor-bench), mainly its [Vite plugin investigation](https://github.com/push-based/ng-hybrid-preprocessor-bench/blob/main/docs/vite-plugin-investigation.md). Individual choices are logged in [decisions.md](decisions.md).

Snapshot: 16 October 2026. ngp built from Angular `92e5aa8` (`22.3.0-next.2`), Vite 8.3.4, Node 26.12.0.

## Why build it

Every Angular dev server today compiles the whole program before it serves a module. `ng serve` runs esbuild and uses Vite only to serve the output. `@analogjs/vite-plugin-angular` compiles the program in `buildStart` and ignores the code Vite passes to `transform`. Both inherit that from ngc, which can't compile a file until it has built a `ts.Program` and analyzed every decorator in it. The bench's audit traced 15 of Analog's workarounds to that one fact: slow cold starts, whole-program recompiles on every edit, styles outside Vite's CSS pipeline, and private Angular APIs that break on minor releases.

ngp removes the constraint. Its Rust analyzer answers per file on demand, and `processFile(file, code)` returns output byte-identical to a full build. The bench measured the first module served in 164 ms on a 5,000-component app, and a one-file edit costing about 1 ms in the analyzer plus 3 ms to regenerate the file.

Nobody else has a Vite plugin on ngp. The Angular CLI plans ngp as a per-file transform inside its esbuild plugin, with Vite still only serving files. `@oxc-angular/vite` is per-file but uses its own compiler and skips template type-checking. The opening closes when Angular ships ngp experimentally, which their blog puts "later this year", or when Analog adopts the CLI's transform mode.

## How it works

Four pieces, all in [packages/vite-plugin-ngp/src](../packages/vite-plugin-ngp/src):

**Loading ngp** ([ngp-api.ts](../packages/vite-plugin-ngp/src/ngp-api.ts)). ngp isn't on npm. The plugin imports `preprocessor/api.js` from a toolchain directory built by the bench repo's `pnpm toolchain`. It passes the native engine's path to `createAnalyzer` explicitly, so the loader can't fall back to wasm without anyone noticing. The bench measured wasm at up to twice native's time.

**Compiling a module** ([compiler.ts](../packages/vite-plugin-ngp/src/compiler.ts)). One `HybridCompiler` lives as long as the dev server, in optimize mode. `transform` runs with `enforce: 'pre'` on every `.ts` outside `node_modules`. If Vite's code differs from what the analyzer last saw, the plugin calls `analyzer.updateFileContent` first. Then it calls `processFile(file, code)` and returns the result with a source map. Vite's own TypeScript transform strips the types afterwards. Files ngp leaves unchanged return `null`.

**Handling an edit** ([index.ts](../packages/vite-plugin-ngp/src/index.ts), `hotUpdate`). The plugin sends the new content of a changed `.ts` or `.html` file to the analyzer, which returns every TypeScript file whose output may have changed. The plugin drops those files from ngp's cache, invalidates them in Vite's module graph, and returns them to Vite. It never runs `analyzeOptimizedDelta`, which streams every file in the program again after each edit. Vite asks again for the modules the page still uses, and those get regenerated. There's no component HMR yet, so every edit reloads the page.

**Keeping edits cheap** ([entry-tsconfig.ts](../packages/vite-plugin-ngp/src/entry-tsconfig.ts)). After every update, ngp's analyzer reloads its tsconfig and re-expands the `include` globs, walking the whole source tree. That made a one-line edit cost 172 ms at 5,000 components. The plugin writes a tsconfig into Vite's cache directory that extends the user's and lists only the entry points. The analyzer finds every other file by following imports, and the same edit costs about 1 ms. The upstream fix would be to re-resolve entry points only when files are added or deleted. ngp doesn't accept outside contributions, so the workaround stays until Angular fixes it.

One trap is already fixed. The plugin remembers what the analyzer has seen for each file. For a file it hasn't seen yet, a transform compares against disk. A watcher event can't, because disk already holds the edit. So watcher edits to unseen files, which includes every template's first edit, always go to the analyzer.

## What works, and what doesn't yet

Verified in the [playground](../playground): `vite build`, dev-server boot with no console errors, signals and control flow, a lazy route, and template and component edits reloading with fresh output.

| Piece | Status |
|---|---|
| Per-module transform, optimize mode | Works |
| Edit → analyzer update → module invalidation | Works, page reloads |
| Entry-only analyzer tsconfig | Works. Same output as the full tsconfig for every playground module ([test](../packages/vite-plugin-ngp/test/entry-tsconfig.test.mjs)) |
| Production build through the same transform | Works, unoptimized |
| Linker for `node_modules` | Missing. The playground loads `@angular/compiler` so the runtime can JIT Angular's own packages. That compiler ships to the browser: the playground's production bundle is 1.2 MB |
| Component HMR (`/@ng/component`, `angular:component-update`) | Missing. ngp already emits the client code and the update modules |
| External styles, encapsulation, preprocessors | Missing. Without `externalRuntimeStyles`, ngp reads `styleUrl` files itself and inlines them, untested here. With it, styles would become Vite modules |
| Template type-checking | Missing. Planned as a worker running `tsgo` over ngp's `.ngtypecheck.ts` output |
| SSR, i18n, Vitest | Out of scope for now |

## Where it's weak

- **ngp is a prototype, and the plugin uses it as one.** The plugin types the API by hand and reaches into `HybridCompiler.fileCache` and `analyzer.updateFileContent`, below the public `updateFileContent` that runs the delta. Any Angular commit can break that. Pinning Angular to exactly `22.3.0-next.2` holds it still for now.
- **Nobody can install it.** Using the plugin means building ngp from source with Rust. That's fine for us and a blocker for anyone else, until Angular publishes ngp or we ship prebuilt binaries per platform.
- **New files are untested.** With an entry-only tsconfig, the analyzer should find a new file through the import that adds it. The bench only measured edits to existing files.
- **Several environments share one compiler.** Client and SSR environments call the same plugin instance. That's fine for a client-only app. With SSR, updates from two environments could race.
- **No numbers of our own yet.** All the performance claims come from the bench's spikes, not from this plugin running a real dev server.

## What to measure next

Against `ng serve`, Analog's default path and `@oxc-angular/vite`, on the bench's generated apps (100, 1,000, 5,000 components) and its two real apps: dev-server cold start to first paint, edit-to-update latency, and production build time. The first two decide whether the plugin is worth using. The third decides whether it can replace `ng build`.
