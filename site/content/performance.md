---
title: Performance
description: How fast vite-plugin-ngp starts, updates and builds next to ng serve, Analog and @oxc-angular/vite, measured end to end on apps of 100 to 5,000 components.
---

# Performance

On a 5,000-component app, vite-plugin-ngp shows the first page 1.9 seconds after you start the dev server, where `ng serve` takes 28.5 seconds. A template edit reaches the page in about 150 ms, where `ng serve` takes 1.8 seconds and Analog reloads the page in 2.8 seconds. Both grow far more slowly with the app than the CLI's, and the plugin type-checks the whole time. `@oxc-angular/vite` is faster still at everything, but it uses its own compiler, doesn't type-check, and its builds don't split `@defer` blocks into their own chunks. Production builds are where the plugin gains least: 20 seconds against `ng build`'s 30, both type-checking.

This page is for you if you're deciding whether to try vite-plugin-ngp instead of the Angular CLI or Analog, and want to know what you'd gain and what you'd give up. Every number here was measured on one laptop on 16 October 2026, with the benchmark in the repo's `bench/` folder. The last sections say how, and where these numbers are weak.

## What was measured

Four toolchains, each with its own README's setup and nothing else, on the same apps, with the same Angular, `22.3.0-next.2`:

| Toolchain | Version | Type-checks? |
|---|---|---|
| vite-plugin-ngp | the repo at commit `33b8ecd` | yes: in a background process in dev, and before `vite build` finishes |
| Angular CLI, `ng serve` and `ng build` | `@angular/build` 22.3.0-next.2 | yes, in both |
| Analog, `@analogjs/vite-plugin-angular` | 2.8.2-beta.1, with a one-line patch (see [below](performance#where-these-numbers-are-weak)) | no: `disableTypeChecking` is on by default |
| `@oxc-angular/vite` | 0.0.41 | no, by design |

The three Vite plugins ran on Vite 8.3.4. The apps are generated Angular CLI workspaces of 100, 1,000 and 5,000 components, the same ones the [ngp benchmark](https://github.com/push-based/ng-hybrid-preprocessor-bench) uses (private repo): standalone components with signals, control flow, `@defer`, pipes and directives, half of them with external templates. The fourth app is the repo's playground, 21 components. The Angular CLI can't run the playground, because it reads `import.meta.env`, which only Vite defines.

Each start and build ran once to warm up and 5 times measured. Each edit ran twice to warm up and 10 times measured. The tables show medians. A number marked ±N% varied by more than 5% from run to run (median absolute deviation).

No number counts unless the app worked: the shell rendered every feature link and the first lazy route rendered its heading in headless Chrome, with no console errors, failed requests or exceptions. An edit counts only once the new content is in the DOM and still there 800 ms later. A build counts only if it boots and a second lazy route renders after a router navigation. Every one of these checks passed for every toolchain on every app. The one failure was Analog with its opt-in HMR turned on, described under [Template edits](performance#template-edits).

## Starting the dev server

From starting the process to the first contentful paint of the rendered app.

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 911 ms | 1.01 s | 1.87 s | 889 ms |
| `ng serve` | 2.23 s | 6.88 s | 28.5 s | n/a |
| Analog | 1.10 s | 1.95 s | 6.55 s | 1.07 s |
| `@oxc-angular/vite` | 378 ms | 515 ms | 1.13 s | 357 ms |

That's a cold start: every cache the toolchain keeps was deleted first. A restart, which keeps those caches, is what you do every morning:

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 505 ms | 542 ms | 697 ms | 549 ms |
| `ng serve` | 2.09 s | 6.87 s | 28.0 s | n/a |
| Analog | 975 ms | 1.68 s | 5.76 s | 947 ms |
| `@oxc-angular/vite` | 294 ms | 291 ms | 345 ms | 312 ms |

`ng serve` and Analog compile the whole program before the first page, so their start grows with the app. The CLI's cache barely helps a restart: 28.0 against 28.5 seconds. vite-plugin-ngp compiles only what the first page imports, so at 5,000 components it's 15 times faster than `ng serve` cold and 40 times faster on a restart.

Most of the plugin's cold start is Vite pre-bundling Angular's packages, which a restart skips: 1.2 seconds of the 1.9 at 5,000 components. That step runs Angular's Babel linker on every partially compiled package. `@oxc-angular/vite` pays 0.8 seconds for the same step, so the slower linker probably costs the plugin about 0.4 seconds there. That's an inference from the two differences, not a measurement of the linker itself.

The plugin's background type-check was on for all of these, as it is by default, and it competes for the CPU while the first page loads. Turning it off saved about 150 ms of a cold start at 5,000 components: 1.96 against 2.11 seconds, measured back to back in a separate run. It made no measurable difference to edits.

## Template edits

From writing an external template to the new element in the page. "reload" means the toolchain reloaded the page to show it; every other edit updated the component in place. In brackets, the fastest of the 10 edits.

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 174 ms (71 ms) | 173 ms (96 ms) | 154 ms ±32% (74 ms) | 177 ms (74 ms) |
| `ng serve` | 184 ms (183 ms) | 472 ms (452 ms) | 1.81 s (1.76 s) | n/a |
| Analog, default | 289 ms ±15% (228 ms), reload | 783 ms ±6% (650 ms), reload | 2.76 s (2.67 s), reload | 247 ms ±20% (198 ms), reload |
| `@oxc-angular/vite` | 116 ms (5 ms) | 117 ms (15 ms) | 117 ms (19 ms) | 117 ms (16 ms) |

The plugin's time stays flat from 100 to 5,000 components, because an edit regenerates only the edited component's update. `ng serve` rebuilds, and its time grows to 1.8 seconds. Analog reloads the page by default, and its time grows with the app too.

The fastest edit matters here because of macOS. Vite's file watcher noticed a write after either about 10–35 ms or about 113 ms, unpredictably, in a test with no plugin at all. Every Vite toolchain's times have that in them, which is why the plugin's edits cluster around 75 ms and 175 ms, and `@oxc-angular/vite`'s around 15 ms and 117 ms. Take the fastest edit as the toolchain's own work: about 70 ms for the plugin against 5–20 ms for `@oxc-angular/vite`. The bench measured ngp's analyzer and code generation at about 4 ms per edit, so most of the plugin's 70 ms is elsewhere in its update path. Nobody has profiled it yet.

Analog's component HMR is off by default, and turning it on didn't work here. With `liveReload: true`, template edits on the playground updated in place in 262 ms (194 ms fastest). But on the generated apps, Analog logged an update for every template edit and the page never changed: the browser never asked for the component's new code. And on the playground, a `.ts` edit that changed a class field was sent as an update instead of a reload, so the page kept the old value. Those are the only checks that failed in the whole run, so `liveReload: true` has no row in the tables.

## `.ts` edits

Changing a signal's initial value in the first route's page component. Every toolchain reloads the page for this, because a class change can't be applied to a running component.

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 181 ms (78 ms) | 181 ms (85 ms) | 211 ms ±15% (131 ms) | 163 ms (61 ms) |
| `ng serve` | 237 ms (232 ms) | 529 ms (522 ms) | 1.93 s (1.89 s) | n/a |
| Analog | 302 ms ±13% (224 ms) | 742 ms (678 ms) | 2.79 s (2.55 s) | 294 ms (194 ms) |
| `@oxc-angular/vite` | 162 ms ±6% (66 ms) | 170 ms (69 ms) | 180 ms (83 ms) | 161 ms (65 ms) |

The reload includes fetching and running every module the page needs again. The plugin and `@oxc-angular/vite` are within the watcher's noise of each other here.

## Type errors in the dev server

Only vite-plugin-ngp and `ng serve` type-check in the dev server. This times planting a template type error until the terminal names it, and then removing it until the terminal reports the app clean.

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp, error shown | 509 ms | 658 ms | 1.45 s | 500 ms |
| vite-plugin-ngp, error cleared | 480 ms ±8% | 561 ms | 1.43 s | 498 ms |
| `ng serve`, error shown | 185 ms | 440 ms | 1.66 s | n/a |
| `ng serve`, error cleared | 187 ms | 468 ms | 1.80 s | n/a |

The plugin waits 300 ms after an edit before it checks, so on small apps `ng serve` reports first. At 5,000 components the plugin's whole-program `tsgo` check takes about 1.4 seconds, a little faster than `ng serve`'s rebuild. Neither holds up the page: the plugin's template update arrives in about 150 ms, and the type error 1.45 seconds after the edit.

## Production builds

From starting `vite build` or `ng build` to the process exiting, with caches deleted first.

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 1.46 s | 4.90 s | 20.4 s | 1.18 s |
| vite-plugin-ngp, `typeCheck: false` | 1.30 s | 4.07 s | 17.0 s | 1.10 s |
| `ng build` | 2.08 s | 6.74 s | 30.4 s | n/a |
| Analog | 1.49 s | 4.50 s | 18.6 s | 1.19 s |
| `@oxc-angular/vite` | 262 ms | 438 ms | 1.43 s | 319 ms |

The fair comparisons are the plugin against `ng build`, since both type-check, and the plugin without type-checking against Analog and `@oxc-angular/vite`, which don't. Against `ng build`, the plugin is about a third faster. Without type-checking it matches Analog. `@oxc-angular/vite` builds 5,000 components in 1.4 seconds, about 12 times faster than anything else, because its compiler is Rust from end to end. ngp's analyzer is Rust too, but its code generation is Angular's template compiler, in TypeScript. In a build of the 5,000-component app without type-checking, 14.6 of 16.6 seconds went to transforming modules, and Rolldown's rendering and minifying took the remaining 2. Rolldown's own timings put the plugin's build optimizer, which runs Babel on every module, at 3.6 seconds of that. The rest of the transform time is mostly ngp. The type-check adds another 3.4 seconds at 5,000 components.

## Bundle size

All the JavaScript a build writes, and the initial part: what `index.html` loads plus everything it imports statically, before any lazy route. Gzip at level 9, per file.

| App | Toolchain | All JS | gzip | Initial JS | gzip |
|---|---|---:|---:|---:|---:|
| 100 | vite-plugin-ngp | 424 kB | 127 kB | 233 kB | 71 kB |
| 100 | `ng build` | 421 kB | 128 kB | 247 kB | 77 kB |
| 100 | Analog | 423 kB | 127 kB | 232 kB | 71 kB |
| 100 | `@oxc-angular/vite` | 499 kB | 131 kB | 343 kB | 104 kB |
| 1,000 | vite-plugin-ngp | 2,017 kB | 525 kB | 246 kB | 76 kB |
| 1,000 | `ng build` | 1,994 kB | 523 kB | 251 kB | 78 kB |
| 1,000 | Analog | 2,006 kB | 521 kB | 246 kB | 76 kB |
| 1,000 | `@oxc-angular/vite` | 1,961 kB | 381 kB | 356 kB | 109 kB |
| 5,000 | vite-plugin-ngp | 9,296 kB | 2,341 kB | 313 kB | 97 kB |
| 5,000 | `ng build` | 9,080 kB | 2,275 kB | 268 kB | 81 kB |
| 5,000 | Analog | 9,237 kB | 2,324 kB | 314 kB | 97 kB |
| 5,000 | `@oxc-angular/vite` | 8,570 kB | 1,506 kB | 422 kB | 129 kB |
| playground | vite-plugin-ngp | 382 kB | 127 kB | 308 kB | 98 kB |
| playground | Analog | 384 kB | 127 kB | 309 kB | 97 kB |
| playground | `@oxc-angular/vite` | 467 kB | 149 kB | 421 kB | 130 kB |

The plugin's output is within 3% of `ng build`'s in total, gzipped, at every size, because it runs the CLI's build optimizer on Angular's own compiler output. At 5,000 components its initial JavaScript is 16 kB larger gzipped than `ng build`'s. Analog's is the same size as the plugin's, and both bundle with Rolldown, so that's likely Rolldown's chunking rather than the compiler.

`@oxc-angular/vite`'s total looks a third smaller at 5,000 components, and that's not a saving. Its build doesn't give `@defer` blocks their own chunks: the deferred component's code sits in its route's chunk, so the build writes 892 files where the plugin writes 1,884, and fewer, larger files compress better. Its initial JavaScript is 33–46% larger than the plugin's, gzipped.

## What it adds up to

If your app is large and you use `ng serve`, the dev server is where the plugin changes the most: a dev server that's ready in under 2 seconds instead of half a minute, and template edits in a tenth of the time, with type-checking kept. If you use Analog, the plugin starts 3.5 times faster at 5,000 components and updates templates in place by default, where Analog reloads. Builds improve less: a third faster than `ng build` with the same output size.

`@oxc-angular/vite` beats the plugin on every timing here. What you give up for that is Angular's own compiler, type-checking, and code-splitting for `@defer`. The plugin's output is Angular's compiler's output, byte for byte the same as a full ngp build.

## Where these numbers are weak

- **One laptop, with other work running.** An Apple M2 Max with 12 cores and 32 GB, on macOS 27, Node 26.12.0, headless Chrome 155. Other development sessions were building and testing on the same machine. Each start and build waited for the 1-minute load average to drop below 6, and samples ran at loads between 2.8 and 8.2. That keeps them out of the worst spikes, not out of all of them. The same measurement can drift between runs: the plugin's cold start at 5,000 components was 1.87 seconds in the main run and 2.11 seconds in a run an hour later. Starts and builds ran in rounds, one toolchain after another, so a drift lands on every toolchain in a table alike. Compare toolchains within a table, not with numbers from another run or machine. The plugin changed after the main run, with i18n and the `ng build` options. A recheck at 5,000 components on commit `32b209c` gave the same build time, bundle size and edit times.
- **Generated apps.** They're realistic in shape, but they're not your app: no third-party libraries beyond Angular, no large stylesheets, a global stylesheet of a few lines. The playground is the only hand-written app, and it's small.
- **Cold means the toolchains' caches, not the operating system's.** The file system cache was warm for every run. A first start after a reboot would be slower for everyone.
- **One kind of edit each.** Adding an element to a template, and changing a string in a class. An edit that adds an import or a new component can cost more, and wasn't measured.
- **The watcher's noise is in every Vite number.** Up to about 100 ms per edit, on macOS. Linux uses a different watcher and wasn't measured.
- **Analog was patched.** Its latest stable release, 2.8.1, can't build on Angular 22.3: its build optimizer calls a private `@angular/build` API that now needs an initialization call. 2.8.2-beta.1 adds that call, behind a version check that reads Angular's prerelease version as `NaN` and so still fails. A one-line `parseInt` patch fixes the check. On a stable Angular release, the beta should work unpatched. Not measured.
- **`@oxc-angular/vite` targets Angular 22.2.2.** It doesn't use Angular's compiler, so the Angular version only matters at runtime here, and every app rendered and passed every check.

## Run it yourself

The harness is in `bench/` in the repo, with a [README](https://github.com/push-based/vite-angular/tree/main/bench) on how to run it: one command sets up the apps, one runs the benchmark, and one prints these tables from its result files. The result files behind this page are in `bench/results/`, with the machine, versions, commit and load average of every sample.
