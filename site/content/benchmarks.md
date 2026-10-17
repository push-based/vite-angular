---
title: Benchmarks on real apps
description: vite-plugin-ngp against the Angular CLI on Super Productivity and against Nx on Ghostfolio, two open-source Angular apps, measured for time and memory on GitHub's runners and on a laptop.
---

# Benchmarks on real apps

On GitHub's 4-core runners, vite-plugin-ngp restarts Ghostfolio's dev server in 4.5 seconds where Nx takes 21, and Super Productivity's in 11.5 seconds where `ng serve` takes 24. A template edit reaches the page in about 130 to 150 ms on both apps, in place, where the CLIs take 3.3 to 3.7 seconds. A production build takes 18 seconds against `ng build`'s 32 on Super Productivity, and 18 against Nx's 23 on Ghostfolio. Once the page has rendered after a restart, the plugin's dev server holds 0.9 GB on Ghostfolio and 1.7 GB on Super Productivity, where the CLIs hold 3.5 to 3.7 GB. The cold start is where the plugin gains least, and on Super Productivity it doesn't: 21.4 seconds against 23.1, peaking at 4.9 GB where `ng serve` peaks at 3.6.

This page is for you if the [Performance page](performance)'s generated apps left you asking what the plugin does to an app with Material, NgRx, a Sass design system and a dozen third-party libraries, and what it costs to get such an app running on it. Every number here was measured with the benchmark in the repo's `bench/` folder, on GitHub's Ubuntu runners in [one workflow run](https://github.com/push-based/vite-angular/actions/runs/39017944058) on 17 October 2026, and again on a laptop the same day. The last sections say how, what the two apps needed, and where these numbers are weak.

## What was measured

Two open-source apps, each at one commit, each under the plugin and under the CLI it's built with:

| App | Built with | Components | What's in it |
|---|---|---:|---|
| [Super Productivity](https://github.com/johannesjo/super-productivity), commit `65145cd` | Angular CLI 22.3.0-next.2: `ng serve`, `ng build --configuration production` | 252 | A to-do and time-tracking app. Angular Material, NgRx, ngx-translate, Dexie, Capacitor, a plugin system, three npm-workspace packages compiled from source, a service worker, typia for runtime validation, Sass everywhere. 1,462 TypeScript files in its program |
| [Ghostfolio](https://github.com/ghostfolio/ghostfolio), commit `204f0d8` | Nx 23.2.1 over the same Angular: `nx run client:serve:development-en`, `nx run client:build:production` | 157 | A wealth-management dashboard. Angular Material, Bootstrap's Sass, Chart.js, Ionic, ngx-markdown, 13 locales built from XLIFF, a service worker, a monorepo with `libs/` reached through tsconfig path aliases. 521 TypeScript files in the client's program |

Both apps have every `@angular/*` package pinned to `22.3.0-next.2`, the version ngp is built from, and keep every other dependency where their lockfile had it. The plugin ran on Vite 8.3.4; each CLI ran from the app's own `node_modules`, as the app's `npm start` would run it.

The plugin's setup for each app is a `vite.config.ngp.mjs` written the way [Migrating from ng build](migrating-from-ng-build) says to, plus a root `index.html` with the stylesheet links and entry script the CLI injects. Nothing in either app changed, apart from one small patch each, described under [What the apps needed](benchmarks#what-the-apps-needed). The configs, the patches and the setup script are in the repo's [bench/real](https://github.com/push-based/vite-angular/tree/main/bench/real).

## How it was measured

The harness is the one behind the Performance page, with memory added. For each app and tool, it measures:

| Metric | From | To |
|---|---|---|
| Dev server, cold start | spawning the dev server, with every cache the tool keeps deleted | the first contentful paint of the rendered app in headless Chrome |
| Dev server, restart | the same, keeping the caches the previous start wrote | the same |
| Template edit | writing an external template of the first page | the new element in the DOM, and whether the page reloaded to get it |
| `.ts` edit (Ghostfolio) | changing a string in the landing page's component class | the new text in the DOM |
| Production build | spawning the build, caches deleted | the process exiting, then a boot check and the bundle's size |
| Memory | every start, edit series and build | the peak resident memory of the tool's whole process tree, sampled every 100 ms; for a dev server also what it holds once the page has rendered and settled, and after the edits |

Memory is the sum of each process's resident set: the Vite or CLI process plus what it spawned, which is esbuild, the type-checker, Sass's Dart VM and worker processes, depending on the tool. Pages shared between processes count once per process, so the sum is an upper bound. It's what `top` would add up, and the number a laptop runs out of. Headless Chrome isn't in it.

No number counts unless the app worked. The gate for Super Productivity is its Today view with the side navigation and header rendered; for Ghostfolio, the landing page's heading and the header. No console error, failed request or uncaught exception may occur, with two exceptions the harness knows about: the 401 Ghostfolio's API answers a visitor's `/api/v1/user` with, and the 504 Vite gives a pre-bundled dependency it has just replaced before it reloads the page, in which case the harness times the page that stays. An edit counts once the new content is in the DOM and still there 800 ms later. A build counts if it exits 0, boots from a static server, and renders a second lazy route after a router navigation: Super Productivity's settings page, Ghostfolio's about page. Every check passed for both tools on both apps, in every run reported here.

Each start and build ran once to warm up, then 5 measured times; each edit twice to warm up, then 10 measured times, in one dev-server session. The tables show medians. A number marked ±N% varied by more than 5% from run to run, as median absolute deviation. Starts and builds ran in rounds, one tool after the other, so a drift in the machine lands on both.

Two things the harness does that a developer wouldn't: it runs Nx with its daemon off and `--skip-nx-cache`, so every start and build is its own process and no build is a cache hit, which costs Nx about a second of project-graph work per start; and it runs Ghostfolio against a stub API, because the client fetches `/api/v1/info` before it bootstraps and nothing renders without an answer. The stub serves a saved response from the public instance; both tools proxy `/api` to it the way the app's own `proxy.conf.json` proxies to the real API.

### The machines

| | GitHub Actions | Laptop |
|---|---|---|
| Machine | `ubuntu-latest`, Ubuntu 24.04, 4 cores and 16 GB. Super Productivity's job landed on an AMD EPYC 9V74, Ghostfolio's on an AMD EPYC 7763 | Apple M2 Max, 12 cores, 32 GB, macOS 27 |
| Who else was on it | nobody | other development sessions, building and testing |
| Disk | the runner's | SSD |
| Node, Chrome | Node 26.12.0, Chrome 155 | Node 26.12.0, Chrome 155 |
| One app per | runner, in parallel | the same machine, one after the other |

The runners are the published numbers: nobody else was using them, and anyone with the repo can rerun the workflow. The laptop numbers show how the same comparison looks on a developer's machine with 3 times the cores, and they're noisier, because other sessions were working on it. Each sample recorded the 1-minute load average when it started.

## Starting the dev server

From starting the process to the first contentful paint of the rendered app, cold: every cache deleted first.

![Cold start, restart and production build on each app, on GitHub's runners: the plugin in violet, the app's own CLI in gray. Medians of 5 runs.](charts/real-waits.svg)

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 21.4 s ±6% | 10.4 s | 8.01 s | 4.52 s |
| the app's own CLI | 23.1 s | 21.5 s | 14.3 s | 9.50 s |

A restart keeps the caches the previous start wrote, and is what you do every morning:

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 11.5 s | 4.53 s | 6.53 s | 1.79 s |
| the app's own CLI | 24.4 s | 21.2 s | 13.7 s | 7.32 s |

Ghostfolio shows the pattern from the generated apps: the plugin compiles only what the landing page imports, so it's half of Nx's cold start and a fifth of its restart, on both machines. Nx's cache barely helps a restart, 21.2 seconds against 21.5, because its dev server builds the whole app before it serves anything, and that build is what takes the time. The plugin's server answers its first request after about half a second in every run; the rest is the browser pulling the page's modules through it.

Super Productivity is the surprise. On the runner the plugin's cold start, 21.4 seconds, is within two seconds of `ng serve`'s, and only the restart, 11.5 seconds against 24.4, shows the gain. On the laptop the cold start is 8.0 against 14.3. Where the plugin's cold start goes on four cores wasn't measured, and the candidates are known: Vite pre-bundling the app's dependencies through Angular's Babel linker, which is most of the plugin's cold start on the generated apps and which this app, with Material, the CDK, NgRx and Ionic, has far more of; the background `tsgo` type-check over a 2,445-file program; and typia's TypeScript program for the bench's transformer, which took 2.4 seconds and 0.6 GB on the laptop when measured alone. A restart skips the pre-bundling and halves the time. `ng serve` here is a JIT development build, as the app configures it: the CLI compiles no templates at all and leaves that to the browser, and its restart, 24.4 seconds, is no faster than its cold start.

## Editing

From writing a template of the first page to the new element in the page. "in place" means the component updated without a reload. In brackets, the fastest edit.

![Template and .ts edits on each app, on GitHub's runners: medians of 10 edits, with the fastest edit marked by a ring.](charts/real-edits.svg)

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 145 ms ±7% (95 ms) | 130 ms (126 ms) | 149 ms (85 ms) | 154 ms (91 ms) |
| the app's own CLI | 3.33 s (3.17 s), reload | 3.68 s (3.60 s) | 1.39 s (1.37 s), reload | 924 ms (869 ms) |

The `.ts` edit, a string changed in the landing page's component class:

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | n/a | 413 ms ±7% (383 ms), reload | n/a | 197 ms ±8% (157 ms), reload |
| the app's own CLI | n/a | 4.18 s (4.05 s), reload | n/a | 998 ms (966 ms), reload |

The plugin's template edit lands in 130 to 154 ms on both apps and both machines, in place, keeping the page's state, and the fastest edits in 85 to 126 ms. That's the same flat number the generated apps gave at 100 and at 5,000 components, because an edit regenerates one component's update and nothing else. The CLIs rebuild the app first. `ng serve` on Super Productivity then reloads the page, 3.3 seconds on the runner, because a JIT build has no component HMR. Nx on Ghostfolio applies the update in place, but after a 3.7-second rebuild on the runner, 0.9 seconds on the laptop.

The `.ts` edit changes a testimonial string in Ghostfolio's landing page component. Every tool reloads the page for a class change: the plugin in 413 ms on the runner, Nx in 4.2 seconds. Super Productivity has no `.ts` edit because its Today view renders no string that lives in a component class; its text comes from translation files.

## Production builds

From starting `vite build` or the CLI's production build to the process exiting, with caches deleted first. Both sides do the whole job: compile, type-check, bundle, minify, write the service worker's manifest, and for Ghostfolio write 14 locales.

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 18.0 s | 17.8 s | 10.3 s | 8.92 s |
| the app's own CLI | 31.9 s | 23.1 s | 20.3 s | 9.78 s |

Both builds type-check: the plugin with TypeScript 7 in a child process, the CLIs with TypeScript 6 inside their compiler. On Super Productivity the plugin builds in 18 seconds against `ng build`'s 32 on the runner, and 10 against 20 on the laptop. On Ghostfolio the gap is smaller, 18 against 23 on the runner and 8.9 against 9.8 on the laptop, and the two builds aren't quite the same job: Nx's `browser-esbuild` builder bundles and then translates its output 14 times, and so does the plugin's `i18n` option, but the plugin also writes the service worker's manifest for each of the 14 folders through the bench's helper where the CLI does it once, in process.

## Bundle size

All the JavaScript a build writes for one locale, and the initial part: what `index.html` loads plus everything it imports statically, before any lazy route. Gzip at level 9, per file.

| App | Toolchain | All JS | gzip | Initial JS | gzip | CSS |
|---|---|---:|---:|---:|---:|---:|
| Super Productivity | vite-plugin-ngp | 8,484 kB | 2,335 kB | 4,577 kB | 1,260 kB | 530 kB |
| Super Productivity | the app's own CLI | 9,337 kB | 2,596 kB | 5,084 kB | 1,417 kB | 502 kB |
| Ghostfolio | vite-plugin-ngp | 4,700 kB | 1,267 kB | 3,157 kB | 805 kB | 119 kB |
| Ghostfolio | the app's own CLI | 4,205 kB | 1,232 kB | 2,390 kB | 689 kB | 124 kB |

Super Productivity's build comes out 9% smaller under the plugin, raw, and 10% smaller gzipped, with a smaller initial bundle too. Ghostfolio's comes out 12% larger raw and 3% larger gzipped, and its initial JavaScript is 32% larger raw, 17% gzipped. That wasn't investigated. The Performance page found the same direction at 5,000 generated components and put it down to Rolldown's chunking, which pulls code that several lazy routes share into the initial chunks where the CLI's esbuild leaves it in a shared lazy chunk; the same explanation would fit here, and it's an inference, not a measurement. Both outputs booted and rendered a lazy route in every run.

## Memory

The resident memory of each tool's processes, summed over its process tree.

![Memory on GitHub's runners: what each tool's dev server held after a restart and after the edits, and a build's peak. Medians of 5 runs.](charts/real-memory.svg)

### Dev server, cold start

The peak between process start and the rendered page, and in brackets what the server held once the page had rendered and settled.

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 4.87 GB (3.73 GB settled) | 1.87 GB (1.78 GB settled) | 3.89 GB (3.05 GB settled) | 2.94 GB (2.94 GB settled) |
| the app's own CLI | 3.62 GB (3.52 GB settled) | 3.60 GB (3.59 GB settled) | 3.97 GB (3.95 GB settled) | 3.52 GB (3.52 GB settled) |

### Dev server, restart

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 2.09 GB (1.73 GB settled) | 931 MB (856 MB settled) | 2.18 GB (1.83 GB settled) | 999 MB ±6% (869 MB settled) |
| the app's own CLI | 3.56 GB (3.52 GB settled) | 3.70 GB (3.68 GB settled) | 3.40 GB (3.35 GB settled) | 2.29 GB (2.28 GB settled) |

### Dev server, after the edits

What the server held after the edit series, 24 edits in one session, and in brackets its peak during them.

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 1.73 GB (2.20 GB peak) | 917 MB (1.25 GB peak) | 1.81 GB (2.25 GB peak) | 778 MB (1.12 GB peak) |
| the app's own CLI | 3.84 GB (3.96 GB peak) | 3.97 GB (5.01 GB peak) | 3.50 GB (3.56 GB peak) | 2.31 GB (2.46 GB peak) |

### Production build

The peak during the build.

| Toolchain | Super Productivity, CI | Ghostfolio, CI | Super Productivity, laptop | Ghostfolio, laptop |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 4.17 GB | 2.08 GB | 4.03 GB | 2.26 GB ±6% |
| the app's own CLI | 4.11 GB | 2.60 GB | 4.41 GB | 2.89 GB |

While you work, the plugin's dev server holds a third to a half of what the CLIs hold: after a restart and the page rendered, 1.7 GB against 3.5 GB on Super Productivity and 0.9 GB against 3.7 GB on Ghostfolio, on the runner, and the edits didn't grow it. Nx's server grew during the edits, to a peak of 5.0 GB on Ghostfolio, where the plugin's peaked at 1.25 GB.

The cold start is the exception, and on Super Productivity the plugin is the heavier one: 4.9 GB at its peak on the runner against `ng serve`'s 3.6, and 3.7 GB once the page had rendered against 3.5. That's three processes at once, Vite pre-bundling dependencies, `tsgo` checking the program, and typia's program being built, and it falls to 2.1 GB on a restart. On Ghostfolio the plugin's cold start peaks at 1.9 GB against Nx's 3.6.

Builds are close. The plugin's build of Super Productivity peaks at 4.2 GB on the runner, `ng build`'s at 4.1; on Ghostfolio 2.1 against 2.6. Part of the plugin's build memory is `tsgo`'s type-check running next to Rolldown, which the harness can't separate.

## What it adds up to

If your app looks like Ghostfolio, an Nx workspace with Material and a few libraries, the plugin changes every number you wait on: a dev server ready in 4.5 seconds instead of 21, template edits in 130 ms instead of 3.7 seconds, builds a quarter faster, and a dev server that holds a quarter of the memory. If it looks like Super Productivity, a large Angular CLI app with a plugin system and compile-time validators, the edits and the restart improve as much, the build takes half the time, but the cold start on a small machine doesn't improve and costs more memory, and getting the app to run on a per-file compiler at all is a day of work that this page has done for you once.

Neither app ran on the plugin without changes. The changes were the ones any per-file toolchain needs, not ones ngp needs, and the next section lists them.

## What the apps needed

Getting each app to run under the plugin took a day, and most of it wasn't about ngp. It was about moving a whole-program toolchain's assumptions to a per-file one. Every item below is in the app's `vite.config.ngp.mjs` or in a patch with a header saying why, and both tools compiled the patched sources.

**Type-only re-exports.** Super Productivity re-exports interfaces alongside values in 7 `export { ... } from` statements; Ghostfolio in 1. The CLI compiles with the whole program's types and elides them. A per-file compiler can't tell an interface from a value in another file, compiles the statement to a runtime re-export of nothing, and the browser refuses to link the module, or Rolldown stops the build with "missing export". TypeScript's `isolatedModules` check names every one of them, and its quick fix writes `export type`. The bench applies that fix as a patch, generated by a 60-line script. `ng new` has set `isolatedModules: true` since Angular 19; these apps predate it.

**`emitDecoratorMetadata`.** Both apps still have it on in their tsconfig, a leftover Angular stopped needing years ago. Vite's transform honours it and emits `design:paramtypes` for decorated members, naming parameter types at runtime; types that are interfaces then survive as imports of nothing. Super Productivity's own `@debounce()` method decorators hit this on the first page. The fix is Vite's `oxc.decorator.emitDecoratorMetadata: false`.

**Compile-time transformers.** Super Productivity validates data with typia, whose `typia.assert<T>()` calls are placeholders a TypeScript transformer replaces at compile time, using the type checker. `ts-patch` makes the CLI's compiler run it for free. Nothing on the Vite side runs TypeScript transformers, so the first `typia.createAssert()` throws at startup. The bench adds a Vite plugin that builds a TypeScript program over the app and runs typia's transformer on each module that mentions it, printing TypeScript back out for ngp. That program costs the plugin a few seconds on each start and build of Super Productivity, in the numbers above, and it's typia's cost, not ngp's. unplugin-typia does the same job for Vite users.

**The service worker.** Both apps register `ngsw-worker.js` in production; the CLI writes it and its manifest after the build. The plugin has no option for that, so the bench runs Angular's own `ngsw-config` generator over the output after `vite build`, once per locale folder for Ghostfolio, as the CLI does. Without it the production page logs a failed registration and runs without offline support.

**Stricter checks.** The plugin type-checks with TypeScript 7, which rejects two lines of Super Productivity that TypeScript 6 accepts (`cal.activeDate` inferred as `unknown`); two casts fix them. ngp's type-check blocks report a TS2774 in one Ghostfolio template, `@if (tab.onClick)` over a union type, that ngc's blocks for the same template don't; `$any()` on two expressions takes it out of the check. Which compiler is right there is a question for the two compilers, not this page.

**Smaller things.** tsconfig `paths` become Vite aliases, 12 lines in each config, because Vite doesn't read tsconfig paths. Super Productivity lists `marked-katex-extension` in `externalDependencies` and doesn't install it; Vite's pre-bundling has to resolve every import, so a stub module takes its place and fails where the real import would, at the call. Two of its component stylesheets write `@media (min-width: var(--layout-xs))`, which isn't CSS; Vite's default minifier rejects it and the build uses esbuild's, which lets it through like the CLI. Angular's `assets` list and Sass `includePaths` become 30 lines of Vite config, as the migration page says. Ghostfolio's 13 locales become the plugin's `i18n` option; its Catalan file has two translations the parser can't read in full, which the plugin used to fail on and now reports and builds past, as the CLI does.

## Where these numbers are weak

- **Two apps.** Both are mid-sized, both use Angular Material, and both are the two real apps the private ngp benchmark had already pinned. An enterprise app with 50 libraries and a thousand components may behave differently, and nothing here says how.
- **The runner's CPU varies.** GitHub assigns each job a machine, and two runs can land on different CPUs. Compare the two tools within a table, not a number here with one on the Performance page or from another run.
- **The laptop was busy.** Other sessions were building on it. Samples waited for the 1-minute load average to drop below 6, and recorded it; that keeps them out of the worst spikes, not out of all of them.
- **The plugin's Super Productivity numbers include typia's program.** Several seconds of each start and build build a TypeScript program for typia's transformer, which `ng build` gets from `ts-patch` inside a program it has anyway. The tables can't separate that from ngp.
- **Memory is an upper bound.** Resident set sizes summed over processes count shared pages more than once, and a 100 ms sample can miss a shorter peak.
- **`ng serve` on Super Productivity is a JIT build**, because its development configuration says `aot: false`. That's what its developers run, so that's what was measured, but it makes the CLI's dev server do less compile work than the plugin, which is always AOT, and more work in the browser.
- **Nx ran without its daemon.** A developer's Nx keeps a daemon that saves about a second of project-graph work per start. It's off here so every start is one process.
- **One commit each**, from mid-October 2026. The apps move fast; the pins don't.

## Run it yourself

From the repo, after `pnpm toolchain` and `pnpm build`:

```bash
cd bench && pnpm install
```

```bash
node real.mjs super-productivity && node real.mjs ghostfolio
```

```bash
NGP_TOOLCHAIN=../toolchain/out node run.mjs --apps super-productivity,ghostfolio --tools ngp,cli,nx
```

```bash
node report.mjs results/*.json
```

The first command clones each app at its commit, pins Angular, installs it with its own lockfile, applies the patch and writes the plugin's config in. On GitHub, the `bench-real` workflow does all of this, one app per runner, and prints the report in the run's summary; "Run workflow" on the Actions tab starts it. The [bench README](https://github.com/push-based/vite-angular/tree/main/bench) has every option, and the result files behind this page are in `bench/results/` with the machine, versions, commit and load average of every sample.
