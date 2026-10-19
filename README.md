<img src="site/public/logo.svg" alt="vite-plugin-ngp logo" width="128" height="128" />

# vite-plugin-ngp

[![ci](https://github.com/push-based/vite-plugin-ngp/actions/workflows/ci.yml/badge.svg)](https://github.com/push-based/vite-plugin-ngp/actions/workflows/ci.yml)
[![pages](https://github.com/push-based/vite-plugin-ngp/actions/workflows/pages.yml/badge.svg)](https://github.com/push-based/vite-plugin-ngp/actions/workflows/pages.yml)

**vite-plugin-ngp** lets Vite compile Angular one module at a time, with ngp, the Rust-and-TypeScript preprocessor Angular merged on 8 October 2026. Vite owns the module graph and asks for each file when the browser needs it. No whole-program compile runs first, unlike `ng serve` or Analog.

**Docs: https://push-based.github.io/vite-plugin-ngp/**

This README is for someone who has just cloned this repo. It covers what works today, how to run it, how the repo is laid out, and the rules for changing it. The docs site is for people using the plugin in their own app.

## Why it exists

Every Angular dev server today is built on ngc, which can't compile one file until it has built a TypeScript program for the whole project. So the tools work around Vite instead of with it. `ng serve` uses Vite only to serve esbuild's output. Analog compiles the whole program up front and ignores the code Vite passes to its transform. That's the source of slow cold starts, whole-program recompiles on every edit, and plugins that break on Angular minor releases.

ngp's analyzer answers per file, on demand, with output identical to a full build. That's what a Vite transform needs. Nobody else has a Vite plugin on ngp: the Angular CLI plans to use it inside its esbuild pipeline, and `@oxc-angular/vite` is per-file but uses its own compiler and skips template type-checking.

## Status

A first version on top of a prototype compiler. Each item below was checked in the [playground](playground) or on the docs site, which is itself built with the plugin.

**Works**
- Per-module compilation in ngp's optimize mode, from the code Vite hands over.
- Component HMR for external templates and for inline `template` and `styles` edits. Other `.ts` edits reload the page, as under `ng serve`.
- Server rendering with hydration, in the dev server and in builds (`ssr` option).
- Template and TypeScript type-checking with TypeScript 7 in a separate process: errors in the dev server's terminal and overlay, and a failed `vite build`.
- Angular i18n: `ngp-extract-i18n` for messages, and one translated folder per locale from a single `vite build` (`i18n` option).
- Production builds with Angular's linker and a port of the CLI's build optimizer. The playground's JavaScript comes out within 2% of `ng build`'s for the same app.
- Component stylesheets (`styleUrl`) through Vite's CSS pipeline, so Sass and PostCSS work, with Angular's view encapsulation and in-place updates.
- Vitest with TestBed, compiling only the specs a run asks for and what they import.
- angular.json's `fileReplacements`, `budgets` and `polyfills` as plugin options in the CLI's shapes. Every other build option maps to Vite config.

**Missing**
- Preprocessors in inline `styles`. ngp compiles them as plain CSS, and there's no `inlineStyleLanguage`.
- HTTP status codes from SSR, `@angular/ssr`'s per-route render modes, the service worker, and Windows outside WSL 2.

**Where it's weakest.** Nobody can `npm install` this: ngp isn't published, so the repo builds it from Angular's source, and every `@angular/*` package is pinned to exactly `22.3.0-next.2`. The plugin also uses ngp's API below its intended surface, so any Angular commit can break it. And the numbers come from one laptop: at 5,000 components the dev server shows the first page in 1.9 s where `ng serve` takes 28.5 s, and a template edit lands in about 120 ms where `ng serve` takes 1.8 s, measured end to end with the harness in [bench](bench). Real apps with third-party libraries, Linux, and memory haven't been measured. The [Performance](https://push-based.github.io/vite-plugin-ngp/performance/) page has the tables and says where they're weak.

The full list is on the [status page](https://push-based.github.io/vite-plugin-ngp/status/).

## Run it

You need macOS or Linux (Windows only through WSL 2), Node 26, pnpm 10, git, curl and a C compiler. You don't need Rust, Bazel or an Angular checkout: the build installs its own Rust inside the repo and leaves your system alone.

From the repo root:

```bash
nvm use
```

```bash
pnpm install
```

```bash
pnpm toolchain
```

```bash
pnpm dev
```

`pnpm toolchain` builds ngp into `toolchain/out`. That took about 2 minutes the first time on a 12-core M2 Max, and later runs reuse their caches. `pnpm dev` builds the plugin and starts Vite on the playground at http://localhost:5173. Every page is rendered on the server and hydrated in the browser. Edit any `.html` file under `playground/src/app` and the component updates in place, keeping its state.

For a production build, served by Node at http://localhost:4000:

```bash
pnpm playground:build
```

```bash
pnpm --filter playground start
```

[docs/building.md](docs/building.md) explains each build step, how to check the result, how to move to a newer Angular commit, and what to do when a step fails.

To use the plugin in your own app, follow [Getting started](https://push-based.github.io/vite-plugin-ngp/getting-started/) on the docs site.

## How it works, in one minute

- **Compile on request.** Vite's `transform` hands each `.ts` file to ngp's `processFile`, which returns TypeScript with the decorators compiled away. Vite's own transform strips the types.
- **Edits skip the delta.** The analyzer reports which files went stale, and the plugin invalidates them in Vite's module graph. It never runs ngp's whole-program delta pass, which costs 465 ms per edit at 5,000 components.
- **Entry-only tsconfig.** The analyzer reads a generated tsconfig that lists only the entry points. Otherwise it rescans the whole source tree on every edit: 172 ms against 1 ms at 5,000 components.
- **Libraries get linked.** Angular's linker runs on `node_modules`, both in dependency pre-bundling and in builds, so the browser never needs the JIT compiler.
- **HMR speaks the CLI's protocol.** Update modules are served at `/@ng/component` and announced with `angular:component-update`, so Angular's runtime applies them unchanged.

[How it works](https://push-based.github.io/vite-plugin-ngp/how-it-works/) has the details. [docs/design.md](docs/design.md) has the reasoning, and [docs/decisions.md](docs/decisions.md) logs every choice with its cost.

## Repo layout

| Path | What it is |
|---|---|
| [packages/vite-plugin-ngp](packages/vite-plugin-ngp) | The plugin. `src/index.ts` holds the Vite hooks, `src/compiler.ts` wraps ngp, and `test/` has the tests |
| [playground](playground) | A demo app with one page per Angular feature area. Its [README](playground/README.md) says what each page exercises and what breaks visibly when the plugin gets it wrong |
| [site](site) | The public docs site: an Angular app compiled by the plugin and prerendered with its SSR. The pages are Markdown in [site/content](site/content) |
| [bench](bench) | The end-to-end benchmark: dev-server starts, edits, type-check latency, builds, bundle sizes and memory for the plugin, `ng serve`, Analog and `@oxc-angular/vite` on generated apps, and for the plugin against their own CLI on two real apps, Super Productivity and Ghostfolio. Its results are behind the Performance and Benchmarks pages |
| [toolchain](toolchain) | Builds ngp from Angular's source, at the commit in [versions.env](toolchain/versions.env) |
| [docs](docs) | For people working on the plugin: [building.md](docs/building.md), [design.md](docs/design.md), [decisions.md](docs/decisions.md) |
| [.github/workflows](.github/workflows) | `ci` builds ngp on a clean Ubuntu runner, runs the tests and builds the playground. `pages` deploys the docs site. `bench-real` benchmarks the two real apps, on demand |
| [CLAUDE.md](CLAUDE.md) | Rules for agents working in this repo. They apply to people too |

## Scripts

| Command | What it does |
|---|---|
| `pnpm toolchain` | Builds ngp into `toolchain/out` |
| `pnpm build` | Builds the plugin into `packages/vite-plugin-ngp/dist` |
| `pnpm test` | Builds the plugin, then runs its tests against `toolchain/out` |
| `pnpm dev` | Builds the plugin, then starts the playground's dev server |
| `pnpm playground:build` | Builds the playground's client and server bundles |
| `pnpm site:dev` | Runs the docs site with live reload |
| `pnpm site:build` | Builds and prerenders the docs site |
| `pnpm docs:check` | Checks the docs site against the code: the options table, the sidebar, front matter and links. Part of `pnpm test` and of CI |

The tests run the plugin on the playground and on small fixture apps. They cover the entry-only tsconfig (identical output), HMR in a real dev server (template, inline-style and stylesheet edits in place, one reload when the class changed too), adding, renaming and deleting files, the build optimizer, type-checking, Vitest, the `ng build` options, i18n, and which Angular libraries get bundled on the server. CI runs them on every push: about 8 minutes on a 2-core runner when the Rust cache is cold, about 2 minutes with it.

## Changing things

**Docs ship with the code.** A change a plugin user would notice isn't done until the docs site says what the code now does. Update the matching page in [site/content](site/content) in the same commit, run `pnpm site:build`, and push: every push to `main` redeploys the site. [CLAUDE.md](CLAUDE.md) has the table of which page covers what.

**Log design choices.** Each choice gets an entry in [docs/decisions.md](docs/decisions.md): what was decided, why, what it costs, and when to revisit it. When a decision changes, add a new entry that supersedes the old one. Don't edit the old one.

**Write in Clarity style.** Docs follow [Clarity](https://clarity.addy.ie/): write for one reader you can picture, be specific enough to be wrong, and take a position and say where it's weak. Don't publish a number that wasn't measured, and say where each number came from. The site and this repo are public and the bench repo is private, so never publish machine paths, and keep links into private repos few and labeled.

**Commit small, commit your own paths.** Commit each coherent change on its own, with its docs, and push. Several people and agent sessions often share one checkout, so commit only your own paths (`git commit -- <paths>`) and never revert changes you didn't make.

**Moving to a newer Angular** means rebuilding ngp at the new commit and updating every `@angular/*` pin together. [docs/building.md](docs/building.md) walks through it.

## Related

- [ng-hybrid-preprocessor-bench](https://github.com/push-based/ng-hybrid-preprocessor-bench) (private): PushBased's benchmark of ngp against ngc, and the investigation this plugin started from.
- [angular/angular#71259](https://github.com/angular/angular/pull/71259): the pull request that merged ngp into Angular.
