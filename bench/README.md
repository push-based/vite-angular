# End-to-end benchmark

This measures vite-plugin-ngp against the three other ways to run Angular on Vite or in Angular's own build: the Angular CLI (`ng serve` and `ng build`), Analog's `@analogjs/vite-plugin-angular`, and VoidZero's `@oxc-angular/vite`. It times what a developer waits for, from process start to pixels in a real browser, on the same apps with the same Angular. The results and what they mean are on the docs site's [Performance page](../site/content/performance.md). This page is for running it again.

## What it measures

| Metric | From | To |
|---|---|---|
| Dev server, cold start | spawning the dev server, with every cache deleted | the first contentful paint of the rendered app in headless Chrome |
| Dev server, restart | the same, keeping the caches the previous start wrote | the same |
| Template edit | writing an external template | the new element in the DOM, and whether the page reloaded to get it |
| `.ts` edit | changing a signal's initial value in a page component | the new text in the DOM (every tool reloads the page for this) |
| Production build | spawning the build, with caches deleted | the process exiting |
| Bundle size | the build's output | all JavaScript, and the initial part (what `index.html` loads plus its static imports), raw and gzipped |
| Type error in dev (ngp and the CLI only) | planting `{{ benchMissingN }}` in a template | the dev server's terminal naming `benchMissingN`; then, after removing it, the terminal reporting the app clean |

Starts and builds take 1 warm-up and 5 measured runs by default. Edits take 2 warm-ups and 10 measured edits in one dev-server session. Reported numbers are medians. A result whose median absolute deviation exceeds 5% of its median is marked noisy in the report.

Starts and builds run in rounds, one tool after another, so a slow drift in the machine's load spreads across all tools instead of landing on one.

## What has to hold before a number counts

A sample that fails any of these is not timed, and the report marks the tool as failed for that metric.

1. **The app rendered.** For a generated app: every feature link in the shell and the first lazy route's page heading. For the playground: the overview's heading and its four pipeline steps.
2. **No errors.** No `console.error`, uncaught exception or HTTP error in the page. The one exception is `/favicon.ico`: the generated apps have none and Chrome asks anyway.
3. **The page settled.** If Vite's dependency optimizer reloads the page after its first paint, the harness waits for the reload and times the document that stays. `firstPaint` in the result files keeps the earlier paint.
4. **The edit arrived and stuck.** The marker the edit wrote is in the DOM, and still there 800 ms later.
5. **The build boots.** It exits 0, renders the app from a static server, and renders a second lazy route after a router navigation.
6. **The app is unchanged.** A SHA-256 over `src/` before and after every app's run.

## Run it

You need Node 26 (`nvm use` in the repo root), pnpm, Chrome, and an ngp build (`pnpm toolchain` in the repo root, then `pnpm build` for the plugin).

```bash
cd bench && pnpm install
```

```bash
node apps.mjs
```

That writes the three generated apps and a copy of the playground to `.work/apps.noindex`. Then, from `bench/`:

```bash
NGP_TOOLCHAIN=../toolchain/out node run.mjs --apps standalone-1000-s1 --max-load 6
```

Options: `--apps` (`standalone-100-s1`, `standalone-1000-s1`, `standalone-5000-s1`, `playground`), `--tools` (`ngp`, `cli`, `analog`, `oxc`, plus the variants below), `--metrics` (`dev-cold`, `dev-warm`, `edit`, `build`, and `typecheck`, which isn't in the default set), `--runs`, `--warmup`, `--edits`, `--edit-warmup`, and `--max-load`, which holds each sample until the 1-minute load average is below that number. Results go to `results/<timestamp>.json` unless `--out` says otherwise. A full run of all four apps took about an hour on an M2 Max.

```bash
node report.mjs results/*.json
```

That prints the markdown tables. A later file wins over an earlier one for the same app, tool and metric, so you can rerun one series and merge it.

## The tools, and how each is set up

Every tool runs from `bench/node_modules` with Angular 22.3.0-next.2, the version ngp is built from, and the three Vite plugins with Vite 8.3.4. Each one gets its README's setup and nothing else, written into the app by [lib/tools.mjs](lib/tools.mjs). The only additions are a separate `cacheDir` and `build.outDir` per tool, so no tool reuses another's dependency cache or output.

| Tool | Dev | Build | Type-checks? |
|---|---|---|---|
| vite-plugin-ngp | `vite` with `ngp()` | `vite build` | yes, in a background `tsgo` process in dev, and before a build finishes |
| Angular CLI | `ng serve` (development) | `ng build` (production) | yes, in both |
| Analog | `vite` with `angular()` and `resolve.mainFields: ['module']` | `vite build` | no: `disableTypeChecking` defaults to true |
| @oxc-angular/vite | `vite` with `angular()` | `vite build` | no, by design |

Two variants are opt-in, for questions the defaults can't answer: `ngp-notc` (`typeCheck: false`, to compare builds with the tools that don't type-check) and `analog-hmr` (`liveReload: true`, Analog's opt-in component HMR).

Where the setup isn't what a user would get from `npm install`, and why:

- **Analog is 2.8.2-beta.1, patched.** The latest stable, 2.8.1, fails `vite build` on Angular 22.3: its build optimizer calls `@angular/build`'s private `JavaScriptTransformer` without the `initializeHash()` call that 22.2 started to require. 2.8.2-beta.1 adds the call behind a version check, but the check computes the version with `Number('0-next.2')`, which is `NaN` for a prerelease, so it still fails. [patches/](patches) changes that one line to `parseInt`. On a stable Angular 22.2 or later, the unpatched beta would take the same path.
- **@oxc-angular/vite 0.0.41 targets Angular 22.2.2's output.** It doesn't use Angular's compiler at all, so the Angular version only matters at runtime here.
- **The CLI can't run the playground.** The playground reads `import.meta.env` and `import.meta.hot`, which only Vite defines. The generated apps are plain Angular CLI workspaces and run everywhere.
- **The playground runs without SSR.** Its own config turns on vite-plugin-ngp's server rendering, which none of the others offers in the same form, so every tool renders it in the browser.

## The apps

[corpus/generate.mjs](corpus/generate.mjs) is the bench repo's generator, vendored. It writes the same `src/` byte for byte for the same size and seed. It adds the `serve` target `ng new` writes, which the bench repo didn't need, and records in `manifest.json` which files the harness edits: the first route's page component, and the first external template that route renders outside a `@defer` block. The bench repo's [methodology](https://github.com/push-based/ng-hybrid-preprocessor-bench/blob/main/docs/methodology.md#corpus) describes what's in the apps.

## Noise, and what it can't tell you

- **It runs on a laptop, next to other work.** The published numbers come from a 12-core M2 Max on battery or mains (each result file says which), while other sessions on the same machine were building and testing. `--max-load` keeps samples out of the worst spikes, not out of all of them. Each sample records the load average when it started. Compare tools within a run, not runs across days.
- **The OS file cache is always warm.** Cold means every tool's own caches are gone, not the operating system's. A first start after a reboot would be slower for everyone.
- **Headless Chrome on the same machine.** The browser competes with the dev server for the same cores, as it does on a developer's laptop.
- **Edits are timed with the type-check running.** ngp's and the CLI's dev servers type-check after each edit, in the background. Back-to-back edits can overlap with the previous check.
- **One edit shape per kind.** A template edit that adds an element, and a class edit that changes a string. Other edits, like adding an import, can cost more.
