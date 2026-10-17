---
title: Performance
description: How fast vite-plugin-ngp starts, updates and builds next to ng serve, Analog and @oxc-angular/vite, and how much memory each holds, measured end to end on apps of 100 to 5,000 components.
---

# Performance

On a 5,000-component app, vite-plugin-ngp shows the first page 1.7 seconds after you start the dev server, where `ng serve` takes 28.3 seconds. A template edit reaches the page in about 120 ms, where `ng serve` takes 1.8 seconds and Analog reloads the page in 2.7 seconds. Neither grows much with the app, where the CLI's times grow with every component, and the plugin type-checks the whole time. Once the page is up after a restart, the plugin's dev server holds 1.0 GB where `ng serve` holds 6.0 GB. `@oxc-angular/vite` matches the plugin's typical template edit and is faster and lighter at everything else, but it uses its own compiler, doesn't type-check, and its builds don't split `@defer` blocks into their own chunks. Production builds are where the plugin gains least: 20 seconds against `ng build`'s 30, both type-checking, at the same peak memory.

This page is for you if you're deciding whether to try vite-plugin-ngp instead of the Angular CLI or Analog, and want to know what you'd gain and what you'd give up. The apps here are generated; [Benchmarks on real apps](benchmarks) measures two open-source apps against their own CLI on GitHub's runners. Every number here was measured on one laptop on 17 October 2026, in one run of the benchmark in the repo's `bench/` folder, on the plugin at commit `92efd3a`. Each figure shows the medians its table lists; the plugin's bar is violet, every other tool's gray. The last sections say how it was measured, and where these numbers are weak.

## What was measured

Four toolchains, each with its own README's setup and nothing else, on the same apps, with the same Angular, `22.3.0-next.2`:

| Toolchain | Version | Type-checks? |
|---|---|---|
| vite-plugin-ngp | the repo at commit `92efd3a` | yes: in a background process in dev, and before `vite build` finishes |
| Angular CLI, `ng serve` and `ng build` | `@angular/build` 22.3.0-next.2 | yes, in both |
| Analog, `@analogjs/vite-plugin-angular` | 2.8.2-beta.1, with a one-line patch (see [below](performance#where-these-numbers-are-weak)) | no: `disableTypeChecking` is on by default |
| `@oxc-angular/vite` | 0.0.41 | no, by design |

The three Vite plugins ran on Vite 8.3.4. The apps are generated Angular CLI workspaces of 100, 1,000 and 5,000 components, the same ones the [ngp benchmark](https://github.com/push-based/ng-hybrid-preprocessor-bench) uses (private repo): standalone components with signals, control flow, `@defer`, pipes and directives, half of them with external templates. The fourth app is the repo's playground, 21 components. The Angular CLI can't run the playground, because it reads `import.meta.env`, which only Vite defines.

Each start and build ran once to warm up, then 5 measured times. Each edit ran twice to warm up, then 20 measured times. The tables show medians. A number marked ±N% varied by more than 5% from run to run, as median absolute deviation.

No number counts unless the app worked: the shell rendered every feature link and the first lazy route rendered its heading in headless Chrome, with no console errors, failed requests or exceptions. An edit counts only once the new content is in the DOM and still there 800 ms later. A build counts only if it boots and a second lazy route renders after a router navigation. Every one of these checks passed for every toolchain on every app. The one failure, in an earlier run, was Analog with its opt-in HMR turned on, described under [Template edits](performance#template-edits).

Memory was recorded for every start, edit series and build: the resident memory of the tool's whole process tree, sampled every 100 ms. The [Memory](performance#memory) section has it.

## Starting the dev server

From starting the process to the first contentful paint of the rendered app.

![Cold start to first contentful paint: medians of 5 runs per tool and app, one laptop, 17 October 2026.](charts/dev-cold.svg)

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 813 ms | 994 ms | 1.74 s | 775 ms |
| `ng serve` | 2.18 s | 6.98 s | 28.3 s | n/a |
| Analog | 1.10 s | 1.94 s | 6.46 s | 1.07 s |
| `@oxc-angular/vite` | 370 ms | 529 ms | 1.11 s | 357 ms |

That's a cold start: every cache the toolchain keeps was deleted first. A restart keeps those caches, and is what you do every morning:

![Restart to first contentful paint, with the caches kept: medians of 5 runs.](charts/dev-warm.svg)

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 435 ms | 452 ms | 565 ms | 468 ms |
| `ng serve` | 2.08 s | 6.82 s | 27.9 s | n/a |
| Analog | 1.03 s | 1.68 s | 5.77 s | 958 ms |
| `@oxc-angular/vite` | 321 ms | 297 ms | 333 ms | 303 ms |

`ng serve` and Analog compile the whole program before the first page, so their start grows with the app. The CLI's cache barely helps a restart: 27.9 against 28.3 seconds. vite-plugin-ngp compiles only what the first page imports, so at 5,000 components it's 16 times faster than `ng serve` cold and almost 50 times faster on a restart.

Most of the plugin's cold start is Vite pre-bundling Angular's packages, which a restart skips: 1.2 seconds of the 1.7 at 5,000 components. That step runs Angular's Babel linker on every partially compiled package. `@oxc-angular/vite` pays 0.8 seconds for the same step, so the slower linker probably costs the plugin about 0.4 seconds there. That's an inference from the two differences, not a measurement of the linker itself.

The plugin's background type-check was on for all of these, as it is by default, and it competes for the CPU while the first page loads. Turning it off saved about 150 ms of a cold start at 5,000 components, 1.96 against 2.11 seconds, measured back to back in a separate run on 16 October. It made no measurable difference to edits.

## Template edits

From writing an external template to the new element in the page. "reload" means the toolchain reloaded the page to show it; every other edit updated the component in place. In brackets, the fastest edit.

![Template edit to the DOM: medians of 20 edits per tool and app, with the fastest edit marked by a ring.](charts/edit-template.svg)

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 123 ms (61 ms) | 115 ms ±7% (58 ms) | 124 ms ±10% (60 ms) | 129 ms (66 ms) |
| `ng serve` | 185 ms (177 ms) | 464 ms (449 ms) | 1.81 s (1.74 s) | n/a |
| Analog, default | 264 ms ±10% (236 ms), reload | 796 ms (645 ms), reload | 2.70 s (2.56 s), reload | 201 ms (194 ms), reload |
| `@oxc-angular/vite` | 80 ms ±48% (15 ms) | 117 ms (14 ms) | 118 ms (16 ms) | 119 ms (18 ms) |

The plugin's time stays flat from 100 to 5,000 components, because an edit regenerates only the edited component's update. `ng serve` rebuilds, and its time grows to 1.8 seconds. Analog reloads the page by default, and its time grows with the app too.

The fastest edit matters here because of macOS. In a test with no plugin at all, Vite's file watcher noticed a write after either about 10–35 ms or about 113 ms, unpredictably. Every Vite toolchain's times have that in them, so each toolchain's edits cluster around two values, and a median depends on how many of a run's edits got the slow report. That's why `@oxc-angular/vite`'s median at 100 components is 80 ms with a ±48% spread and 117 ms everywhere else: more fast reports in that run, not a faster tool.

The rings show what the medians hide. The plugin's edits cluster around 60 ms and 120 ms, and `@oxc-angular/vite`'s, in the same run, around 16 ms and 118 ms. On a slow report the two tie. On a fast one, the plugin still waits: it holds a template update until 50 ms after the template was written, in case the same save also changes the component's class, and when the watcher reports within 10 ms about 40 ms of that window is left ([How it works](how-it-works#component-hmr)). Everything else, from the analyzer through ngp's update module to the message to the browser, takes about 5 ms. Until 17 October the wait counted from the watcher's report instead, and the plugin's edits clustered around 75 ms and 175 ms.

Analog's component HMR is off by default, and turning it on didn't work here, in a run on 16 October with the same Analog version. With `liveReload: true`, template edits on the playground updated in place in 262 ms (194 ms fastest). But on the generated apps, Analog logged an update for every template edit and the page never changed: the browser never asked for the component's new code. And on the playground, a `.ts` edit that changed a class field was sent as an update instead of a reload, so the page kept the old value. Those were the only checks that failed, so `liveReload: true` has no row in the tables.

## `.ts` edits

Changing a signal's initial value in the first route's page component. Every toolchain reloads the page for this, because a class change can't be applied to a running component.

![.ts edit to the DOM: medians of 20 edits, with the fastest edit marked by a ring.](charts/edit-ts.svg)

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 180 ms (79 ms) | 186 ms (85 ms) | 200 ms ±14% (126 ms) | 168 ms (64 ms) |
| `ng serve` | 242 ms (229 ms) | 530 ms (505 ms) | 1.92 s (1.89 s) | n/a |
| Analog | 323 ms ±8% (232 ms) | 757 ms ±5% (632 ms) | 2.69 s (2.56 s) | 199 ms (195 ms) |
| `@oxc-angular/vite` | 168 ms (66 ms) | 169 ms (100 ms) | 182 ms (79 ms) | 145 ms ±13% (61 ms) |

The reload includes fetching and running every module the page needs again. The plugin and `@oxc-angular/vite` are within the watcher's noise of each other here.

## Type errors in the dev server

Only vite-plugin-ngp and `ng serve` type-check in the dev server. This times planting a template type error until the terminal names it, and then removing it until the terminal reports the app clean.

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp, error shown | 512 ms | 639 ms | 1.37 s | 500 ms |
| vite-plugin-ngp, error cleared | 501 ms | 544 ms | 1.36 s | 499 ms |
| `ng serve`, error shown | 182 ms | 433 ms | 1.60 s | n/a |
| `ng serve`, error cleared | 184 ms | 455 ms | 1.73 s | n/a |

The plugin waits 300 ms after an edit before it checks, so on small apps `ng serve` reports first. At 5,000 components the plugin's whole-program `tsgo` check takes about 1.4 seconds, a little faster than `ng serve`'s rebuild. Neither holds up the page: the plugin's template update arrives in about 120 ms, and the type error 1.4 seconds after the edit.

## Production builds

From starting `vite build` or `ng build` to the process exiting, with caches deleted first.

![Production build, process start to exit: medians of 5 builds per tool and app.](charts/build.svg)

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 1.32 s | 4.81 s | 20.2 s | 1.09 s |
| vite-plugin-ngp, `typeCheck: false` | 1.16 s | 3.88 s | 16.7 s | 1.01 s |
| `ng build` | 2.02 s | 6.72 s | 30.1 s | n/a |
| Analog | 1.44 s | 4.50 s | 18.4 s | 1.22 s |
| `@oxc-angular/vite` | 255 ms | 441 ms | 1.42 s | 315 ms |

The fair comparisons are the plugin against `ng build`, since both type-check, and the plugin without type-checking against Analog and `@oxc-angular/vite`, which don't. Against `ng build`, the plugin is about a third faster. Without type-checking it comes in a little under Analog. `@oxc-angular/vite` builds 5,000 components in 1.4 seconds, about 12 times faster than anything else, because its compiler is Rust from end to end. ngp's analyzer is Rust too, but its code generation is Angular's template compiler, in TypeScript. In a build of the 5,000-component app without type-checking, profiled on 16 October, 14.6 of 16.6 seconds went to transforming modules, and Rolldown's rendering and minifying took the remaining 2. Rolldown's own timings put the plugin's build optimizer, which runs Babel on every module, at 3.6 seconds of that. The rest of the transform time is mostly ngp. The type-check adds another 3.5 seconds at 5,000 components.

## Bundle size

All the JavaScript a build writes, and the initial part: what `index.html` loads plus everything it imports statically, before any lazy route. Gzip at level 9, per file.

| App | Toolchain | All JS | gzip | Initial JS | gzip |
|---|---|---:|---:|---:|---:|
| 100 | vite-plugin-ngp | 424 kB | 127 kB | 232 kB | 71 kB |
| 100 | `ng build` | 421 kB | 128 kB | 247 kB | 77 kB |
| 100 | Analog | 423 kB | 127 kB | 232 kB | 71 kB |
| 100 | `@oxc-angular/vite` | 499 kB | 131 kB | 343 kB | 104 kB |
| 1,000 | vite-plugin-ngp | 2,017 kB | 525 kB | 246 kB | 76 kB |
| 1,000 | `ng build` | 1,994 kB | 523 kB | 251 kB | 78 kB |
| 1,000 | Analog | 2,006 kB | 521 kB | 246 kB | 76 kB |
| 1,000 | `@oxc-angular/vite` | 1,961 kB | 381 kB | 356 kB | 109 kB |
| 5,000 | vite-plugin-ngp | 9,296 kB | 2,342 kB | 313 kB | 97 kB |
| 5,000 | `ng build` | 9,080 kB | 2,275 kB | 268 kB | 81 kB |
| 5,000 | Analog | 9,237 kB | 2,324 kB | 314 kB | 97 kB |
| 5,000 | `@oxc-angular/vite` | 8,570 kB | 1,506 kB | 422 kB | 129 kB |
| playground | vite-plugin-ngp | 403 kB | 135 kB | 354 kB | 115 kB |
| playground | Analog | 406 kB | 134 kB | 355 kB | 114 kB |
| playground | `@oxc-angular/vite` | 490 kB | 157 kB | 443 kB | 137 kB |

The plugin's output is within 3% of `ng build`'s in total, gzipped, at every size, because it runs the CLI's build optimizer on Angular's own compiler output. At 5,000 components its initial JavaScript is 16 kB larger gzipped than `ng build`'s. Analog's is the same size as the plugin's, and both bundle with Rolldown, so that's likely Rolldown's chunking rather than the compiler.

`@oxc-angular/vite`'s total looks a third smaller at 5,000 components, and that's not a saving. Its build doesn't give `@defer` blocks their own chunks: the deferred component's code sits in its route's chunk, so the build writes 892 files where the plugin writes 1,884, and fewer, larger files compress better. Its initial JavaScript is 33–46% larger than the plugin's on the generated apps, gzipped, and 19% on the playground.

The playground's builds carry the `$localize` runtime, about 20 kB, 8 kB gzipped, because its copy in the benchmark imports it the way `ng add @angular/localize` would, so that all three toolchains run the same code. The plugin's own `i18n` option drops it ([Internationalization](i18n)).

## Memory

The resident memory of each toolchain's processes, summed over its process tree and sampled every 100 ms: the Vite or CLI process plus what it spawned, which is esbuild, `tsgo`, Sass's Dart VM and worker processes, depending on the tool. Shared pages count once per process, so a sum is an upper bound. It's what `top` would add up, and the number a laptop runs out of. Headless Chrome isn't in it.

![Dev server memory after a restart, once the page had rendered and settled: medians of 5 runs.](charts/memory-dev.svg)

What the dev server held once the page had rendered after a restart, and in brackets its peak between the process start and that point:

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 360 MB (431 MB ±7% peak) | 549 MB (805 MB peak) | 1.01 GB (1.01 GB peak) | 333 MB (393 MB peak) |
| `ng serve` | 793 MB (793 MB peak) | 1.81 GB (1.81 GB peak) | 5.73 GB (6.03 GB peak) | n/a |
| Analog | 453 MB (453 MB peak) | 616 MB (616 MB peak) | 1.38 GB (1.38 GB peak) | 473 MB (473 MB peak) |
| `@oxc-angular/vite` | 221 MB (221 MB peak) | 221 MB (221 MB peak) | 262 MB (262 MB peak) | 222 MB (222 MB peak) |

After the edit series, 44 edits in one session, and in brackets the peak during them:

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 333 MB (461 MB peak) | 519 MB (836 MB peak) | 1.43 GB (2.46 GB peak) | 325 MB (422 MB peak) |
| `ng serve` | 883 MB (891 MB peak) | 1.86 GB (2.12 GB peak) | 6.57 GB (6.86 GB peak) | n/a |
| Analog | 467 MB (517 MB peak) | 1,009 MB (1.09 GB peak) | 2.59 GB (3.55 GB peak) | 475 MB (502 MB peak) |
| `@oxc-angular/vite` | 180 MB (234 MB peak) | 205 MB (231 MB peak) | 235 MB (267 MB peak) | 197 MB (228 MB peak) |

A cold start peaks higher for every tool, because Vite's pre-bundling and the CLI's first compile run then: 1.61 GB for the plugin at 5,000 components, 5.89 GB for `ng serve`, 2.05 GB for Analog and 970 MB for `@oxc-angular/vite`.

![Peak memory of a production build: medians of 5 builds.](charts/memory-build.svg)

| Toolchain | 100 | 1,000 | 5,000 | playground |
|---|---:|---:|---:|---:|
| vite-plugin-ngp | 631 MB | 1.48 GB | 5.02 GB | 603 MB |
| vite-plugin-ngp, `typeCheck: false` | 600 MB | 1.17 GB ±6% | 3.73 GB | 545 MB |
| `ng build` | 771 MB | 1.46 GB | 5.08 GB | n/a |
| Analog | 681 MB | 1.11 GB | 3.36 GB | 662 MB |
| `@oxc-angular/vite` | 280 MB | 578 MB | 1.55 GB | 270 MB |

The dev server is where the difference is. `ng serve` holds the whole compiled program, so it grows with the app, to 5.7 GB at 5,000 components after a restart and 6.6 GB after the edits. The plugin holds what the browser has asked for: 1.0 GB after a restart at 5,000 components, less than Analog's 1.4 GB for the same page without a type-checker, and 1.4 GB after the edits where Analog holds 2.6 GB. Both peak higher during the edits, the plugin at 2.5 GB and Analog at 3.6; the plugin's `tsgo` check runs again after each edit, but the harness doesn't separate its share from Vite's. `@oxc-angular/vite` holds a quarter of a gigabyte at every size, with no type-checker and a compiler that keeps no program.

Builds are even. The plugin's build of the 5,000-component app peaks at 5.0 GB against `ng build`'s 5.1, and 3.7 GB without the type-check, a little above Analog's 3.4. The 1.3 GB between the two plugin rows is `tsgo` checking the program next to Rolldown: the harness can't separate the two processes, but the type-check is the only difference between the rows.

## What it adds up to

If your app is large and you use `ng serve`, the dev server is where the plugin changes the most: a dev server that's ready in under 2 seconds instead of half a minute, template edits in a tenth of the time, and a fifth of the memory, with type-checking kept. If you use Analog, the plugin starts 3.7 times faster at 5,000 components and updates templates in place by default, where Analog reloads. Builds improve less: a third faster than `ng build` with the same output size and the same peak memory.

`@oxc-angular/vite` beats the plugin on every timing here except the typical template edit, where they tie, and holds a quarter of its memory. What you give up for that is Angular's own compiler, type-checking, and code-splitting for `@defer`. The plugin's output is Angular's compiler's output, byte for byte the same as a full ngp build.

## Where these numbers are weak

- **One laptop, with other work running.** An Apple M2 Max with 12 cores and 32 GB, on macOS 27, Node 26.12.0, headless Chrome 155. A virtual machine held one core for the whole run, and other development sessions were on the same machine. Each start and build waited for the 1-minute load average to drop below 6, and samples ran at loads between 2.3 and 6.0, with one exception: fourteen runaway processes another session had left behind pushed the load to 30 during the 100-component app's builds. That series was run again once they were stopped, and the tables show the rerun. Waiting for the load keeps samples out of the worst spikes, not out of all of them, and starts and builds ran in rounds, one toolchain after another, so a drift lands on every toolchain in a table alike. Compare toolchains within a table, not with numbers from another run or machine: the same measurement drifts between runs, and this run's numbers differ from the 16 October run's by a few percent either way.
- **Generated apps.** They're realistic in shape, but they're not your app: no third-party libraries beyond Angular, no large stylesheets, a global stylesheet of a few lines. The playground is the only hand-written app, and it's small. [Benchmarks on real apps](benchmarks) has Super Productivity and Ghostfolio.
- **Cold means the toolchains' caches, not the operating system's.** The file system cache was warm for every run. A first start after a reboot would be slower for everyone.
- **One kind of edit each.** Adding an element to a template, and changing a string in a class. An edit that adds an import or a new component can cost more, and wasn't measured.
- **The watcher's noise is in every Vite number.** Up to about 100 ms per edit, on macOS. Linux uses a different watcher and wasn't measured here; the real apps ran on Ubuntu runners.
- **Memory is an upper bound.** Resident set sizes summed over processes count shared pages more than once, and a 100 ms sample can miss a shorter peak.
- **Analog was patched.** Its latest stable release, 2.8.1, can't build on Angular 22.3: its build optimizer calls a private `@angular/build` API that now needs an initialization call. 2.8.2-beta.1 adds that call, behind a version check that reads Angular's prerelease version as `NaN` and so still fails. A one-line `parseInt` patch fixes the check. On a stable Angular release, the beta should work unpatched. Not measured.
- **`@oxc-angular/vite` targets Angular 22.2.2.** It doesn't use Angular's compiler, so the Angular version only matters at runtime here, and every app rendered and passed every check.

## Run it yourself

The harness is in `bench/` in the repo, with a [README](https://github.com/push-based/vite-angular/tree/main/bench) on how to run it: one command sets up the apps, one runs the benchmark, one prints these tables from its result files, and one draws the figures. The result files behind this page are in `bench/results/`, with the machine, versions, commit and load average of every sample.
