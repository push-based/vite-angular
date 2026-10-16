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

*16 October 2026. Superseded by 14.*

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

*Superseded by 12.*

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

## 11. Node 26

*16 October 2026*

**Decision.** `.nvmrc` pins Node 26.12.0, and both `package.json` files require `>=26.0.0`.

**Why.** We chose to run on the newest Node line. Angular's CLI and ngp both accept it: their `engines` field allows `>=26.0.0`.

**Cost.** The bench repo still pins Node 24, so ngp is built under 24 and run under 26 here. That works because the native engine is an N-API addon, and N-API is stable across Node versions. The plugin test, `vite build` and the dev server all pass on 26.12.0.

## 12. Link libraries with Angular's Babel linker

*16 October 2026. Replaces 9.*

**Decision.** The plugin runs `createEs2015LinkerPlugin` from `@angular/compiler-cli/linker/babel` on every `node_modules` module that contains `ɵɵngDeclare`, except `@angular/core` and `@angular/compiler`. It runs as a Rolldown plugin in `optimizeDeps.rolldownOptions` for dev pre-bundling, and as a `transform` for builds and for deps that aren't pre-bundled. The playground no longer imports `@angular/compiler`.

**Why.** It's Angular's public linker API, and the bench's bundled builds already boot with it. Without a linker, every partially compiled library needs the JIT compiler in the browser. The playground's production bundle went from 1,197 kB to 589 kB.

**Cost.** Babel is slower than the oxc-based linker the CLI moved to (angular/angular-cli#33625). That costs time once per dependency in dev, because Vite caches pre-bundled deps, and once per build. The `@babel/core` dependency adds install weight.

**Revisit when** cold dev start or build time shows linking as a real share. The CLI's oxc linker is in `@angular/build`'s private API.

## 13. Define Angular's compile-time globals

*16 October 2026*

**Decision.** Define `ngJitMode: false` everywhere, `ngDevMode: false` in builds, and `ngServerMode: false` in the client environment, matching what `@angular/build` sets for a browser build.

**Why.** Without `ngDevMode: false`, a production build ran Angular's dev-mode checks and logged "Angular is running in development mode". With these globals the playground bundle shrank from 589 kB to 386 kB, because the minifier drops the dev-only and JIT branches.

**Cost.** `ngJitMode: false` breaks any code that compiles components at runtime. That's rare in apps, and it's the CLI's default for AOT builds too.

## 14. Build ngp in this repo

*16 October 2026. Supersedes 5.*

**Decision.** `toolchain/` builds ngp from the Angular commit in `versions.env`, into `toolchain/out`, with one command: `pnpm toolchain`. The playground and the tests read it from there, and `NGP_TOOLCHAIN` still overrides it. The scripts are the bench repo's, minus what only the benchmark needs: the sidecar engine, hyperfine, and the patches for phase timings and golden tests. A prerequisite check runs first, and CI runs the whole build on a clean Ubuntu machine for every push.

**Why.** Anyone given this repo should be able to build and run everything from it alone. Depending on a second private repo checked out next to it was a setup step nobody could guess from this repo.

**Cost.** The two repos' build scripts can drift apart, and a first build takes about 2 minutes on a 12-core M2 Max because it installs Rust and compiles both engines. ngp's backend now resolves `@angular/compiler` from this repo's `node_modules`, which removes decision 5's cross-repo dependency.

**Revisit when** Angular publishes ngp. Then `toolchain/` goes away and the plugin depends on `@angular/compiler-cli/preprocessor`.

## 15. Component HMR for external template edits only

*16 October 2026. Superseded by 23. Narrowed by 22.*

**Decision.** Only an edit to a component's external template is applied in place. Any edit to a `.ts` file reloads the page, even one that only touches the decorator's inline `template` or `styles`.

**Why.** An update module replaces a component's definition, but its dependencies come from the module that's already running. A template edit can't change those dependencies. A `.ts` edit can: a new entry in `imports` needs a component the running module doesn't have, and a selector change alters parent components' output. The CLI decides this with its own analysis of what changed. Reloading for every `.ts` edit is always correct, so it's the safe first version.

**Cost.** Inline templates and inline styles reload, which is most of the playground's components. External styles can't use HMR yet either, because the plugin doesn't handle them.

**Revisit when** we can tell that a `.ts` edit only changed the decorator's `template` or `styles`. ngp's metadata includes the decorator span (`removalSpans`) and `component.argsSpan`, which is a starting point.

## 16. Stop Vite's page reload with an untransformed template node

*16 October 2026*

**Decision.** For a template edit handled by HMR, `hotUpdate` returns `ensureEntryFromUrl(templateUrl, false)`: a module node for the `.html` file that Vite has never transformed.

**Why.** Vite's docs say a hook can return `[]` and send its own event. For a `.html` file in the client environment, though, Vite treats no modules as a page change and reloads. Vite stops propagation at a node whose `isSelfAccepting` is still undefined, because it hasn't been analyzed. That gives "handled, nothing to reload".

**Cost.** It depends on undocumented propagation behavior in Vite 8.3. If Vite changes it, template edits will reload again, with nothing failing loudly. The playground HMR check would catch that.

**Revisit when** Vite offers a supported way to mark a `.html` file as not a page, or on every Vite minor upgrade.

## 17. One ngp compiler per environment consumer

*16 October 2026*

**Decision.** The plugin keeps one compiler for the browser and one for server environments. Only the browser's compiles with `enableHmr`.

**Why.** HMR code runs at module load and imports `<module dir>/@ng/component?c=<id>`. On the server that's a `file://` URL that doesn't exist, so with one shared compiler every component failed to load its update module during SSR. ngp sets `enableHmr` when the compiler is created, so one compiler can't produce both outputs.

**Cost.** Two Rust analyzers in a dev server with SSR: about twice the analyzer memory, and every edit is analyzed twice. The server compiler starts only when something is rendered on the server.

**Revisit when** ngp can turn HMR output on per `processFile` call.

## 18. Bundle @angular/* in server environments

*16 October 2026. Partly superseded by 20, which widens what's bundled.*

**Decision.** Server environments set `resolve.noExternal: [/^@angular\//]` and define `ngServerMode: true` and `ngHmrMode: false`.

**Why.** Vite externalizes `node_modules` on the server by default. Node then loads Angular's packages unlinked, and a second `@angular/core` copy appeared next to the one the app used, so rendering failed with `NG0203`. Bundling them sends them through the linker and keeps one copy.

**Cost.** Angular's packages are transformed on every dev server start, not loaded straight from disk. Third-party Angular libraries outside `@angular/` are still externalized, so they'd load unlinked. Each one has to be added to `resolve.noExternal` until the plugin finds them itself.

## 19. Render pages in the plugin, behind a `render(url, document)` contract

*16 October 2026*

**Decision.** With `ssr` on, the plugin's dev middleware renders every page request through the server entry's default export. In production, the app serves `dist/` itself. The playground uses a 46-line `node:http` server.

**Why.** Without the middleware, every app would have to write Vite's custom-server setup (`middlewareMode`, module runner, `transformIndexHtml`) to see SSR in dev. A function from URL and document to HTML is the smallest contract that `renderApplication` fits and that any Node server can call. Production servers vary too much (Express, Fastify, edge runtimes) for the plugin to pick one.

**Cost.** No status codes, headers or redirects: the contract returns a string. `@angular/ssr`'s `AngularNodeAppEngine` handles those, and it expects the CLI's build manifest, which this plugin doesn't produce.

**Revisit when** an app needs status codes or redirects, or route-level render modes and prerendering.

## 20. Bundle every Angular library on the server, found from package.json

*16 October 2026. Widens 18.*

**Decision.** Server environments bundle `@angular/*`, plus every package the app depends on that depends or peer-depends on `@angular/core`. The plugin finds those by walking `package.json` files from the app's `dependencies`, following each Angular library's own dependencies too.

**Why.** Material, NgRx and in-house UI kits ship partially compiled, just like Angular's own packages. With only `/^@angular\//` bundled, Node would load them on the server unlinked, and rendering would need the JIT compiler. A dependency on `@angular/core` is the one thing every Angular library declares.

**Cost.** Only `dependencies` count, not `devDependencies`, so an Angular library listed under `devDependencies` stays external. The walk reads a few `package.json` files per server start. A library that imports Angular without declaring it would be missed. That's a broken package, but the user can still list it in `resolve.noExternal`.

## 21. Publish the docs as an Angular SSR site built with the plugin

*16 October 2026*

**Decision.** The user docs live in `site/`: an Angular app compiled by vite-plugin-ngp with `ssr: true`, prerendered to static HTML by `site/scripts/prerender.mjs`, hydrated in the browser, and deployed to GitHub Pages at https://push-based.github.io/vite-angular/ on every push to `main`. Pages are markdown in `site/content`, compiled to HTML at build time with marked and Shiki. The look is the PushBased design system's tokens and `.pb-*` classes. `CLAUDE.md` and the README require every user-visible change to update the matching page in the same commit.

**Why.** Building the docs with the plugin makes the site a second real app, next to the playground: every deploy runs per-module compilation, linking, the server build and hydration from a clean machine. Static prerendering is what Pages can host. Compiling markdown at build time keeps marked and Shiki out of the browser bundle.

**Cost.** The site is public while the repo is private, so its GitHub links only work for push-based members. Every deploy builds ngp, which takes minutes when the Rust cache is cold. Prerendering uses `renderApplication` directly, not `@angular/ssr`, so the script, not Angular, decides which routes exist.

**Revisit when** the repo goes public, or Angular publishes ngp and deploys no longer need to build it.

## 22. Wait 50 ms before template HMR, and reload if the class changed too

*16 October 2026. Narrows 15.*

**Decision.** The plugin sends a template update 50 ms after the template changed, not right away. If the component's `.ts` file changed within 50 ms of the template, before or after it, the plugin sends no update and lets the `.ts` change reload the page. The plugin's `watchChange` hook records when each file changed. The client's `hotUpdate` returns at once and decides in the background.

**Why.** One edit often touches both files: a save-all, a `git checkout`, a rename of a field used in the template. Vite handles each file's change on its own, in whatever order the watcher reports them. When the template came first, its update module ran against the class still on the page. Renaming `loadedMs` in the playground's overview page threw `ctx.loadedAt is not a function`, Angular sent `angular:invalidate`, and the plugin reloaded. The result was right, but every combined edit cost a failed update and an error in the console. When the `.ts` came first, the template update could still reach the page before its reload did. Comparing the analyzer's copy of the `.ts` file with disk would only catch the template-first order, and only if both writes had landed. Timestamps catch both orders. The first version waited inside `hotUpdate`. Vite runs the server environment's `hotUpdate` only after the client's returns, so the server compiler got the new template 50 ms late. The `.ts` reload's server render then threw `ctx.loadedMs is not a function`.

**Cost.** Every template edit reaches the browser 50 ms later. Two writes more than 50 ms apart still count as two edits, so a slow tool that writes the template first gets the old failed update and reload. The window is a guess at how close one save writes its files. It wasn't measured across editors.

**Revisit when** `.ts` edits can be applied in place (see 15). Then the plugin would send one update for both files instead of reloading.

## 23. Update inline templates and styles in place, with the CLI's rules

*16 October 2026. Supersedes 15.*

**Decision.** When a component's `.ts` file changes, the plugin parses the old and the new content with TypeScript and compares them the way `analyzeFileUpdates` in `@angular/build` does ([hmr-candidates.ts](../packages/vite-plugin-ngp/src/hmr-candidates.ts)). Every top-level statement has to be textually identical, leading comments included, except inside a component class. There, the name, modifiers, `extends`/`implements` and members have to be identical too, the class has exactly one decorator, and only the values of `template` and `styles` may differ in it. If that holds, the plugin emits an update module for each component whose values changed and sends `angular:component-update`, as it does for external templates. Any other difference reloads the page.

**Why.** It answers decision 15's question with the rules Angular's own dev server already ships, so an inline edit behaves here the way it does under `ng serve`. A textual comparison can't be fooled by a change it doesn't understand: `imports`, `selector`, an input, a method or a top-level constant all differ as text, so they all reload. ngp's metadata wasn't enough on its own: its `argsSpan` and `removalSpans` describe only the file the analyzer has now, not the one before the edit, and they say nothing about statements outside decorators. The analyzer still decides which classes are components.

A template and its `.ts` file saved together still go through decision 22's 50 ms wait. If the `.ts` change was applied in place, the class on the page is unchanged, so the template update goes out too, after the `.ts` update. The page gets both without a reload. If the `.ts` change reloads, the template sends nothing, as before.

**Cost.** Being textual makes it strict. Reformatting a method, or a comment inside a class, reloads even though nothing changed. So does a template kept in a constant outside the decorator, like the playground's `encapsulation.ts`, and any component with a second decorator. Each `.ts` edit is parsed twice more, outside ngp; that's not measured, but it's one file. The CLI also updates in place when `templateUrl`, `styleUrl` or `styleUrls` change, and the plugin doesn't yet, because pointing a component at another file hasn't been tried with ngp's analyzer.

**Revisit when** ngp exposes its own "what changed" answer for an edit, or when external styles become Vite modules and `styleUrl` edits need the same treatment.
