# Decision log

Each entry records one choice: what we decided, why, what it costs, and when to look at it again. Newest at the bottom. When a decision changes, add a new entry that replaces the old one and mark the old one superseded, instead of editing it. [design.md](design.md) describes the result as a whole.

## 1. Build on ngp, not on ngc or a reimplementation

*16 October 2026*

**Decision.** Compile Angular with ngp's `HybridCompiler`, Angular's own analyzer and template compiler.

**Why.** ngc can't compile one file without a whole `ts.Program`, which is the root of most of Analog's workarounds. Reimplementations like Analog's `fastCompile` and `@oxc-angular/vite` compile per file, but they skip template type-checking and match Angular's output only partly. Analog's own docs say "87%+". ngp gives per-file compilation with output identical to a full build.

**Cost.** ngp is an unpublished prototype that doesn't accept outside issues or pull requests.

**Revisit when** Angular publishes ngp, or changes its API.

## 2. Optimize mode only, in dev and in production

*16 October 2026*

**Decision.** Always create the analyzer and compiler with `optimize: true`.

**Why.** In local mode, compiling per file changed the output of 745 of 1,089 modules in the bench's lazy-start spike. Components lost `OnPush`, and `@defer` dependencies became dynamic imports. Losing `OnPush` changes how the app behaves at runtime. Optimize mode matched a full build for every module.

**Cost.** The analyzer's whole-program queries (`ComponentMapping`, `ProgramFiles`) run again after edits.

**Revisit when** local mode matches optimize mode when files are compiled one at a time.

## 3. Skip the delta pass and let Vite's module graph decide what to regenerate

*16 October 2026*

**Decision.** On an edit, call the analyzer's own `updateFileContent`, drop the stale files from ngp's cache, and invalidate them in Vite's module graph. Never call `HybridCompiler.updateFileContent` or `analyzeOptimizedDelta`.

**Why.** The delta streams every file in the program again after each edit: 465 ms at 5,000 components. The analyzer's stale set over-approximates, marking 202 files when 1 or 2 changed. Vite asks again only for the modules the page still uses.

**Cost.** The plugin depends on `HybridCompiler.fileCache` and the analyzer object, which are below ngp's intended API.

**Revisit when** ngp offers an update that doesn't run the delta.

## 4. Give the analyzer a tsconfig that lists only the entry points

*16 October 2026*

**Decision.** Write `tsconfig.entry.json` into Vite's cache directory. It extends the user's tsconfig, sets `files` to the entries and `include` to `[]`. The analyzer reads that one. Compiler options still come from the user's tsconfig. `entryOnlyTsconfig: false` turns it off.

**Why.** After every update, the analyzer reloads its tsconfig and re-expands the `include` globs: 172 ms per edit at 5,000 components, against about 1 ms with only `files` to resolve. The output was identical in the bench's spike.

**Cost.** Files that no entry imports, directly or indirectly, are invisible to the analyzer. Adding new files hasn't been tested. Same output is checked only on the playground ([test](../packages/vite-plugin-ngp/test/entry-tsconfig.test.mjs)), not on a large app.

**Revisit when** Angular re-resolves entry points only when files are added or deleted. The code marks this `TODO(parity)`.

## 5. Load ngp from the bench repo's toolchain build

*16 October 2026*

**Decision.** The plugin imports ngp from a directory set by the `toolchain` option or `NGP_TOOLCHAIN`. The playground defaults to `../ng-hybrid-preprocessor-bench/toolchain/out`.

**Why.** ngp isn't on npm. The bench repo already builds it from a pinned commit without Bazel, and its golden tests pass on all three engines. A second build pipeline here would just duplicate it.

**Cost.** Two repos have to be checked out side by side, and ngp resolves `@angular/compiler` from the bench repo's `node_modules`, not this one's. Both are pinned to `22.3.0-next.2`, so for now they're the same version.

**Revisit when** we want anyone outside push-based to try the plugin. Then we either vendor prebuilt binaries per platform or wait for Angular to publish ngp.

## 6. Native engine by default, with no silent fallback

*16 October 2026*

**Decision.** `engine` defaults to `native`, and the plugin passes that engine's path explicitly. `wasm` is opt-in.

**Why.** ngp's loader falls back from native to wasm by itself. The bench measured wasm at up to twice native's time, so a silent fallback would make every measurement misleading.

**Cost.** Platforms without a native build have to set `engine: 'wasm'` themselves.

## 7. Target Vite 8 and its Environment API only

*16 October 2026*

**Decision.** Peer dependency `vite ^8.3.0`. Use the `hotUpdate` hook and `transform` hook filters, not `handleHotUpdate` and `server.moduleGraph`.

**Why.** Vite 8 is current, and `@oxc-angular/vite` requires it too. Analog's use of the older hooks is one of its listed problems with environments.

**Cost.** Projects still on Vite 7 or earlier can't use the plugin.

## 8. Pin Angular to exactly 22.3.0-next.2

*16 October 2026*

**Decision.** Every `@angular/*` dependency is pinned to `22.3.0-next.2`, the release built from ngp's commit `92e5aa8`.

**Why.** ngp's backend imports compiler-cli's private `hybrid_analysis` API, which has to come from the same commit.

**Cost.** Moving to a newer Angular means rebuilding ngp at that commit and updating every pin together.

## 9. JIT fallback in the playground until there's a linker

*16 October 2026*

**Decision.** The playground's `main.ts` imports `@angular/compiler`, so the runtime can finish compiling Angular's partially compiled packages in the browser.

**Why.** It got an app running from start to finish before building the linker, which is a known piece of work (the CLI's oxc-based linker is the reference) and not a question about ngp.

**Cost.** The compiler ships to the browser, and the playground's production bundle is 1.2 MB. Libraries' startup in dev doesn't reflect what an AOT build would do.

**Revisit when** the linker lands. This entry gets superseded then.

## 10. Private repo in the push-based org

*16 October 2026*

**Decision.** The code lives at `push-based/vite-angular`, private, like the bench repo.

**Why.** The bench repo is private, and the plugin depends on its unpublished toolchain.

**Revisit when** we publish the bench results or the plugin.
