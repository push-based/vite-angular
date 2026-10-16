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

**Cost.** Files that no entry imports, directly or indirectly, are invisible to the analyzer. New files work: the analyzer finds them through imports ([decision 25](#25-tell-the-analyzer-about-deleted-files-with-invalidatefiles)). Same output is checked only on the playground ([test](../packages/vite-plugin-ngp/test/entry-tsconfig.test.mjs)), not on a large app.

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

*16 October 2026. Narrows 15. Superseded by 35.*

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

## 24. Port the CLI's build optimizer, in builds only

*16 October 2026*

**Decision.** `vite build` runs a copy of the oxc-based pass from `@angular/build` (`src/tools/oxc/oxc-transform.js` at `22.3.0-next.2`) on every module that mentions `ɵ`, `InjectionToken` or decorator metadata: the app's own code after Vite strips its types, and library code after the linker ([optimizer.ts](../packages/vite-plugin-ngp/src/optimizer.ts)). It wraps classes with Angular static members, and TypeScript enums, in IIFEs marked `/*#__PURE__*/`. In `@angular/*` packages that declare `"sideEffects": false` it marks every top-level call and `new` pure, and elsewhere only `new InjectionToken(...)`. It replaces `ɵsetClassMetadata` calls inside their wrappers with `void 0`, and removes `ctorParameters`, `decorators` and `propDecorators` assignments. `forwardRef` is pure through Rolldown's `treeshake.manualPureFunctions`, which is what the CLI passes to esbuild as `pure`. The pass parses with Vite's own oxc parser (`parseSync`) and edits with magic-string. The dev server never runs it.

**Why.** Rolldown already drops an unused expression marked pure, but nothing in Angular's output tells it which expressions are. A class with `static ɵcmp = ɵɵdefineComponent(...)` has a call in a static initializer, so Rolldown keeps every component, pipe and service it has seen, used or not. Rolldown has no option that covers this. `manualPureFunctions` takes function names, not "every top-level call in this package", and nothing makes a class with side-effecting statics removable. So the rewrites have to happen in a transform, and the CLI's is the one Angular's packages are tested against.

Measured on the playground's client build, with the same script for every row (JavaScript on the first page, then all JavaScript, in kB, gzip level 9 in brackets):

| | First page | All JS |
|---|---|---|
| Before | 502.2 (158.4) | 551.5 (178.6) |
| After | 315.7 (99.1) | 389.9 (128.7) |
| `ng build` of the same app | 335.6 (108.5) | 383.1 (128.7) |

The docs site, the other app built with the plugin, went from 461.9 kB (143.3 gzip) to 297.5 kB (92.8) on its first page. The pass runs on server bundles too, where the playground's JavaScript went from 1,492 kB to 1,172 kB.

The halves need each other. Marking top-level calls pure alone gives 418.6 kB on the playground's first page, wrapping classes alone 442.1 kB, and both together 315.7 kB: a pure call that references a class still keeps it, if the class itself looks side-effecting, and the other way round. Enums are worth 4 kB. The metadata removal saves nothing here, because `ngDevMode: false` (decision 13) already lets the minifier drop those calls. It stays because it's part of the CLI's pass and costs nothing.

The `ng build` row is the playground copied into a CLI project with an `angular.json`, minus the server entry and the CSS import in `main.ts`, built with `@angular/build` `22.3.0-next.2`. All JavaScript is within 2% raw and equal gzipped. The first page is smaller here because Rolldown splits chunks differently from esbuild, not because less code ships.

**Cost.** It's a copy of someone else's code. When the CLI changes its pass, this one doesn't follow until someone ports the change. Marking every top-level call in Angular's packages pure trusts that none of them is there for its side effect. The CLI trusts the same thing, so a package that broke it would break `ng build` too. Third-party libraries such as NgRx get the class wrapping but not the top-level marking, as under the CLI. The pass takes about 0.2 s over the 1.8 MB of Angular's own packages. Whole builds didn't get slower, because the minifier then has less code to work on. That was measured on the playground only.

**Revisit when** `@angular/build` exports its optimizer, or Rolldown can mark a package's top-level code pure. Then the plugin should call that instead of keeping a copy.

## 25. Tell the analyzer about deleted files with invalidateFiles

*16 October 2026*

**Decision.** When a `.ts` or `.html` file is deleted, the plugin calls `analyzer.invalidateFiles` for it instead of `updateFileContent`, and invalidates every importer of the file in Vite's module graph. A file counts as deleted when it can't be read, whatever event the watcher reported. After compiling a component, the plugin reports NG2008 for every `templateUrl` file that doesn't exist. And when a component's last compile failed, an edit to its template or inline template reloads the page instead of updating in place.

**Why.** The plugin used to ignore deletes. The analyzer keeps every file sent with `updateFileContent` in an in-memory overlay and never drops it, so after a delete it went on compiling importers against the deleted content, and Vite kept serving the importers' cached output: no error at all. `invalidateFiles` is the only call that drops the overlay. In ngp at `92e5aa8` it treats created, deleted and changed files alike, so the plugin uses it only for deletes and keeps `updateFileContent` for the rest. In the tests the analyzer's stale list did include the importers, but the plugin invalidates Vite's importers as well, so the error doesn't depend on that list being complete. Disk decides instead of the event type because on macOS, chokidar reported newly created files as `change` in the tests. The NG2008 check exists because ngp compiles a missing template to an empty one without a diagnostic, even in a fresh compiler. A deleted template would otherwise give a blank component. The reload after a failed compile is needed because the failed component isn't running in the browser, and an update sent to it changes nothing on the page.

[file-changes.test.mjs](../packages/vite-plugin-ngp/test/file-changes.test.mjs) covers new components, deletes, renames, deleting a file that's still used, and new, deleted and repointed templates. It runs a real dev server and Vite's watcher, and checks against a fresh compiler. Run against the plugin before this change, four of its eight fail: the three that delete a file, and the `templateUrl` test, which points a component at a template before the file exists. Changing `templateUrl` to another file works too: the analyzer moves the component to the new template, and only edits to the new one update it. That's the case decision 23 hadn't tried. A `templateUrl` change still reloads, as decision 23 says.

**Cost.** One more private analyzer call, `invalidateFiles`, typed by hand. The NG2008 check reads the analyzer's metadata after every component compile. That cost isn't measured, but the analyzer has the metadata cached by then. The check is the plugin's, not Angular's, so its message can differ from ngc's in edge cases. Missing `styleUrl` files aren't checked.

**Revisit when** ngp reports a missing template itself, or drops its overlay on `updateFileContent` for a file that's gone.

## 26. Compile specs on demand under Vitest, with no analyzer entries

*16 October 2026*

**Decision.** When `VITEST` is set, `entries` defaults to none, the analyzer's generated tsconfig lists no files, and `tsconfig.spec.json` comes first. Vitest asks for each spec, and ngp compiles it and whatever it imports as Vitest requests them. HMR and SSR are off.

**Why.** Analog compiles the whole program before the first spec runs, so a run filtered to one spec still pays for every component (analogjs/analog#2325, #2589). ngp's analyzer reads a file the first time `processFile` asks for it, even one no entry reaches. Compiling every playground module with no entries gives the same output as with every file in the program ([test](../packages/vite-plugin-ngp/test/entry-tsconfig.test.mjs)). Spec files need no special handling either, which decision 4 had left open: nothing imports them, and they compile anyway. Filtered to the rating spec, ngp compiles 3 of the playground's 29 modules.

**Cost.** Same output with no entries is checked only on the playground's 33 files. Optimize mode's whole-program queries see only the files read so far, so a difference would show up in components whose output depends on files the spec doesn't import. None did here. Detecting Vitest from `VITEST` means `vite --mode test` doesn't count as a test run, which is intended.

**Revisit when** a spec compiles differently under Vitest than in the dev server.

## 27. Inline Angular libraries under Vitest, and keep app modules out of its module cache

*16 October 2026*

**Decision.** Under Vitest, the plugin adds `test.server.deps.inline`: every `@angular/*` package and every Angular library in `dependencies` or `devDependencies`, as file-path patterns. It registers a `defineCacheKeyGenerator` callback that returns `false` for the app's `.ts` modules, so Vitest 5's on-disk module cache never stores them. Linked libraries stay in it.

**Why.** Vitest leaves `node_modules` to Node by default, which would load Angular's packages partially compiled. Inlining sends them through the linker and keeps one copy of `@angular/core`. Vitest's cache keys a module by its own content, but a compiled component also depends on its template, its styles and the components it imports, so an edited `.html` file would have come back as the old component. Caching linked libraries is what makes a warm run fast: the playground's 11 tests take 1.1–1.3 s warm against 2.1–2.5 s with an empty cache.

**Cost.** App modules are compiled again on every run, 2–20 ms each in the playground. String patterns were the obvious choice and were wrong: Vitest matches them by substring, so `@ngrx/store` would also inline `@ngrx/store-devtools`. Inlined libraries go through Vite's transform on a cold run, which is slower than Node loading them.

**Revisit when** Vitest's key callback can be async, or ngp can say which files a module's output depends on. Then app modules could be cached too, keyed on those files.

## 28. The app writes the TestBed setup file

*16 October 2026*

**Decision.** The plugin doesn't inject a setup file. The documented recipe is a five-line `src/test-setup.ts` that calls `initTestEnvironment` and resets TestBed in `afterEach`, listed in `test.setupFiles`.

**Why.** Apps add providers and teardown options there, and a file they own is easier to change than an option that wraps one. The `afterEach` line is the one trap: Angular registers that reset only when `afterEach` is a global, and Vitest's globals are off by default. Without it, the second test in a file fails with "the test module has already been instantiated".

**Cost.** Every app copies the same file, and an app that forgets the `afterEach` gets a confusing error. The plugin could export a ready-made setup module instead, at the cost of hiding which test environment runs.

**Revisit when** apps start copying the file with changes nobody needs, or Angular's own Vitest builder settles on a setup the plugin could reuse.
## 29. Type-check with tsgo over the app's sources and ngp's type-check blocks, in a child process

*16 October 2026*

**Decision.** The plugin type-checks with TypeScript 7's CLI (`tsgo`, installed as the `typescript7` alias of `typescript@7.0.2`), spawned as a child process with `--pretty false`. Its program is the app's own tsconfig, extended: the app's `include` stays, the type-check block of every component file is added under `files`, and `rootDirs` lists the blocks' directory next to the filesystem root. The blocks come from `HybridCompiler.getTcbForFile`, per file, cached until the analyzer marks a file stale. They're written under Vite's cache directory at each component's absolute path. A block's `import * as i0 from './app'` then resolves to the app's own `app.ts`, not to ngp's compiled output. Errors inside a block are mapped to the template with Angular's own rule (compiler-cli's `findSourceLocation`): from the node at the error, walk up to the first node followed by a `/*start,end*/` span comment, and take the template file from the block's `ngp-tcb-template-sources` comment. Errors in host bindings map to the component's `.ts`. In dev, a check runs 1 s after the server starts and 300 ms after the last edit, never two at once, and reports to the terminal and to Vite's error overlay when the set of errors changes. `vite build` starts the check after the last module is transformed, waits for it in `generateBundle`, and fails on any error. `typeCheck: false` turns it off, and it's off by default under Vitest.

**Why.** ngp doesn't type-check, by design: its CLI writes `.ngtypecheck.ts` files for a separate TypeScript run. The bench measured that pipeline (S3/S4) on two real apps at 1.87× and 2.04× ngc's speed with `tsgo`, and at 0.90× and 0.97× with `tsc` 6, so TypeScript 7 it is. A child process keeps the Go checker off Vite's thread, so transforms and HMR never wait for it. Checking the app's original sources rather than ngp's compiled output means TypeScript errors need no source map: they're already at the right line and column, and ngp's output, which carries `// @ts-ignore` imports and template functions, never enters the program. The bench checked ngp's output because it also emitted from it. The plugin doesn't emit, Vite does. Getting blocks per file from the compiler, instead of running ngp's CLI, means an edit regenerates only the stale files' blocks. On the playground, a check after an edit takes 100–250 ms in dev, and 90–110 ms in `vite build` for the playground and the docs site. Vite's overlay closes only on the next module update or page reload, and an in-place template update is neither, so a 20-line client module opens and closes the overlay itself, and a page that loads later asks for the current errors.

**Cost.** Every component file has its block generated on the main thread at startup, one file at a time with a yield in between, so it shares the thread with the first page's transforms. That's not measured beyond the playground: 20 blocks, from 19 components, in 60 ms. Every check is a whole-program `tsgo` run, made cheaper by `--incremental` build info in the cache: the bench measured `tsgo` at 18.6 s for a full check at 5,000 components, and the incremental case hasn't been measured. The check's tsconfig lives in Vite's cache directory, and TypeScript resolves `types` entries like `vite/client` from there. With the default cache directory, `node_modules/.vite`, that finds the app's `node_modules`. With a cache directory outside the project, an app whose tsconfig lists `types` gets TS2688 on every check, and tsgo, like tsc, then skips semantic errors. A template given as an expression (`template: TEMPLATE`) gets its errors at the expression, not inside the string, as ngp's own diagnostics do. The `typescript7` dependency adds a platform binary to every install: 26 MB on macOS arm64.

**Revisit when** ngp's analyzer can feed TypeScript 7's API (`typescript/unstable`) directly, which would keep one long-lived program instead of spawning `tsgo` per check. Or when the bench measures the incremental check at 5,000 components and it's too slow for the dev loop.

## 30. Generate type-check blocks from a second compiler that keeps whitespace

*16 October 2026*

**Decision.** `NgpCompiler` holds two `HybridCompiler`s on the same analyzer. The one that compiles modules collapses whitespace, as before. The one that generates type-check blocks is created with `preserveWhitespaces: true` and without HMR, and has its own cache, dropped for the same stale files.

**Why.** ngp parses each template once, with whitespace collapsed, and takes the type-check block's spans from that parse. Every span after a collapsed run of whitespace in the same text node then points too early: in `<h1>\n  {{ titel }}</h1>`, ngp's span puts the error at column 4 and ngc at column 6, under the `t`. ngtsc parses templates a second time for type-checking, with whitespace preserved (its `diagNodes`), and ngp's own source marks the missing second parse `TODO(parity)` in `parseComponentTemplate`. With the second compiler, the plugin's positions match ngc's for every error in the type-check test, checked against ngc on the same app.

**Cost.** Each template is parsed twice, once per compiler. A component that sets `preserveWhitespaces: false` in its decorator overrides the compiler's setting, so its spans still drift. ngtsc ignores the decorator for its type-check parse. ngp doesn't let the plugin do that.

**Revisit when** ngp type-checks a whitespace-preserving parse itself. Then the second compiler goes.

## 31. Drop Angular's ignored codes in type-check blocks, instead of turning off noUnusedLocals

*16 October 2026*

**Decision.** The check keeps the app's `noUnusedLocals` and `noUnusedParameters`. In a type-check block, the plugin drops TS6133, TS6199, TS2695 and TS7006, the same four codes compiler-cli's `shouldReportDiagnostic` drops, and any error under a `/*D:ignore*/` marker.

**Why.** ngp's blocks fail `noUnusedLocals` and `noUnusedParameters`: no `_tcbN` function is ever called. The bench turned both options off for the whole program, which also hides unused locals in the app's own code, which `ng build` reports. Dropping the codes only inside blocks is what ngc does, so the app gets the same errors it would get from `ng build`.

**Cost.** None found. If ngp ever emits a block where one of those codes means a real template error, the plugin hides it, as ngc would.

## 32. Send stylesheets through Vite's CSS pipeline, as links in dev and inlined in builds

*16 October 2026*

**Decision.** ngp always compiles with `externalRuntimeStyles`, so `styleUrl` files leave the component as paths in `ɵɵExternalStylesFeature([...])`. A normal-order plugin rewrites that call after Vite's oxc transform ([styles.ts](../packages/vite-plugin-ngp/src/styles.ts)). In the dev server, client and server alike, the paths become URLs, Angular's runtime adds a `<link>` per stylesheet with `?ngcomp=<id>&e=<encapsulation>`, and the plugin scopes the compiled CSS to that id. In `vite build`, client and server alike, and under Vitest, the call becomes a feature that prepends `?inline` imports to the component's `styles`, scoped at build time for emulated encapsulation. Scoping is `encapsulateStyle` from `@angular/compiler`, run in a transform between `vite:css` and `vite:css-post`.

**Why.** Without `externalRuntimeStyles`, ngp reads `styleUrl` files from disk and inlines them raw, so a `.scss` file arrives in the browser as uncompiled SCSS, and ngp has no hook to change that. Handing the files to Vite gets every preprocessor, PostCSS and `url()` rewriting for free, and `vite:css` hands the plugin plain CSS. So the plugin never touches Vite's output: no regex over `__vite__css`, the pattern that kept breaking in Analog (analogjs/analog#2492, #2049).

Links in dev are what make in-place style edits possible: a `<link>` can be reloaded alone. In builds they'd cost a request per component and a flash of unstyled content, which is why the CLI inlines in production too. The server follows the browser: in dev it renders `<link>`s, so the browser adopts them on hydration and style edits reach them. Rendering inline `<style>`s on the dev server instead would leave the server's stale rules on the page after the first edit.

Build imports are scoped with the id `__ngpcomp__`, and the feature swaps it for `%COMP%` at runtime. Scoping with `%COMP%` directly failed the playground build: Vite's minifier, lightningcss, rejects `%` in an attribute selector. Which classes are emulated comes from ngp's metadata.

**Cost.** Two paths: a bug in one won't show in the other. The tests run the playground's SCSS component through a dev server and a build to cover both. The rewrite finds `ɵɵExternalStylesFeature([...])` by pattern in ngp's output, after oxc. That output is pinned with Angular, and the tests break if its shape changes, but it is still a pattern over generated code. Inline `styles` stay with ngp and can't be preprocessed. Scoping drops CSS source map adjustments. A stylesheet whose text contains `__ngpcomp__` would have it replaced.

**Revisit when** ngp grows a resource hook (then inline styles could be preprocessed too), or emits something less fragile to find than a printed call.

## 33. Serve dev stylesheets under flat names

*16 October 2026*

**Decision.** In the dev server, a component stylesheet's URL is a name with no directory, `<basename>.ngp-<first 8 hex of sha256(path)>.<ext>`, relative to the page. `resolveId`, ordered before Vite's resolver, maps any request whose last path segment is such a name back to the file, whatever directory it arrives under.

**Why.** Angular's `SharedStylesHost` adopts server-rendered `<link>`s keyed by `href.slice(href.lastIndexOf('/') + 1)`, and looks them up by the URL the runtime would add. With root-relative URLs like `/src/app/card.css`, the two never matched. Every link was added a second time on hydration, and Angular copied the adopted ones into `ShadowDom` roots under the shortened key, as relative URLs that loaded `/card.css`, a file that doesn't exist. The Angular CLI uses flat hashed names for this reason. Relative names resolve against the page, so on `/router/signals` the browser asks for `/router/card.ngp-de07cd19.css`, and resolving by name alone handles that without a `<base href>`.

**Cost.** The mapping from name to file lives in memory and is filled as components compile. A request for a stylesheet before its component has compiled in this server process falls through to Vite and fails. That doesn't happen on a normal page load, because the component's module always loads first. Two files with the same basename get different hashes, so names don't collide, but devtools shows `card.ngp-de07cd19.css` rather than the path.

## 34. Update stylesheets with our own HMR event

*16 October 2026*

**Decision.** On an edit to a component stylesheet, or to a file only component stylesheets import, the plugin invalidates those modules, sends `angular:stylesheet-update` with their names, and returns no modules for them. A listener sets the `href` of every matching `<link>`, in the document and in shadow roots, keeping the query and adding a fresh `t=`. Components with external stylesheets import the listener in the dev server's browser environment.

**Why.** Vite's client handles `css-update` with `cleanUrl(path)`: it drops the query, so the new link loses `ngcomp` and arrives unscoped, and it updates only the first `<link>` that matches. One stylesheet used by two components, or copied into a shadow root, has several. The CLI works around the same client by reloading the page for `ShadowDom` components; this listener covers them. Changing `href` on the same element, rather than adding a new one, keeps `SharedStylesHost` pointing at the element it will remove when the component goes away.

The listener first came from `transformIndexHtml`. An app that serves its page without that hook would have lost style edits silently: no update and no reload. Importing it from the components ties it to the code that needs it.

**Cost.** A few lines of client code and an event of our own to keep working. Setting `href` in place may flash the old rules away before the new ones load. That wasn't visible in the playground, but it wasn't measured either. Vite's `css-update` would avoid that by adding the new link before removing the old one.

## 35. Hold a template update only while the page's class is out of date

*16 October 2026. Supersedes 22.*

**Decision.** A template update still waits 50 ms. Then the plugin holds it back only if the component's `.ts` file changed after the browser last loaded it, and that change wasn't applied in place. The page reloads for that change and loads the template with it. If the `.ts` file on disk differs from every version the plugin has seen, the plugin waits up to a second for the watcher to report it, and reloads if the report never comes. A watcher report whose content the plugin has already seen isn't a change: it records nothing, and sends no update.

**Why.** Decision 22 assumed that the watcher reports one save's files within 50 ms of each other, and each write once. FSEvents on macOS breaks both. The dev-server HMR test failed about once in 20 runs of the suite. In one failure, a single template write was reported twice and sent two updates. In another, `app.ts` was reported 1 ms after the save, and `app.html`, with a second report of `app.ts`, 100 ms later. The repeat counted as an in-place edit, so the template update went out to a page the first report was reloading. A wider window would slow every template edit and still be a guess. Comparing with what the page loaded doesn't depend on timing. The browser's transform of a `.ts` module marks when the page got a class, and the watcher marks when the class changed.

It also fixes the opposite mistake. Under 22, a template reported more than 50 ms after its class was sent as an update, even while the page was still reloading for the class. Now the template waits until the page has loaded the new class, and then goes out against it.

**Cost.** More state to keep right: a load and a change per `.ts` file, ordered by one counter. Each `.ts` change and each browser transform reads the file once more, and each template update reads its component's file. A class change the watcher never reports holds the template for a second, then reloads. The load counts when Vite transforms the module, not when the page runs it, so a page that's slow to run a reloaded module could still receive an update meant for after it. That wasn't seen, and the update module the page imports at startup would correct it.

**Revisit when** chokidar or Vite report each save once and in one batch. Then the repeat handling can go, though the load comparison is still the simpler rule.
