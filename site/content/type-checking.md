---
title: Type-checking
description: How vite-plugin-ngp checks templates and TypeScript with TypeScript 7, where the errors show up, and what it costs.
---

# Type-checking

ngp compiles a module without type-checking it, so a typo in a template compiles fine and fails at runtime. vite-plugin-ngp closes that gap: it checks your templates and your TypeScript with TypeScript 7 (`tsgo`) in a separate process, and reports errors where `ng build` would. This page is for you if you're deciding whether you can drop a separate `tsc` run, or want to know why an error showed up where it did.

## What you see

In the dev server, a check runs a second after the server starts and again 300 ms after each edit. Errors appear in the terminal and in Vite's error overlay, at the template line and column:

```text
[vite-plugin-ngp] type-check: 1 error (156 ms)

src/app/pages/overview/overview.html:18:30 - error TS2551: Property 'modee' does not exist on type 'Overview'. Did you mean 'mode'?
  17 |     <div><dt>Angular</dt><dd>{{ angular }}</dd></div>
> 18 |     <div><dt>Mode</dt><dd>{{ modee }}</dd></div>
     |                              ^
```

The check never holds anything up. Your edit is compiled and sent to the page first, and template edits still update in place. Errors are reported when they change, so an unrelated edit doesn't print the same list again. When you fix the last one, the terminal says `type-check: no errors` and the overlay closes. A page you open later shows the current errors straight away.

`vite build` runs the same check and fails if there's any error, with the same list. On this site and on the repo's playground, 4 and 19 components when this was measured, the check adds about 110 ms to the build.

## What it checks

The same things `ng build` checks:

- Your TypeScript, with your tsconfig's options, including `strict` and `noUnusedLocals`.
- Every component's template, with your `strictTemplates` setting: bindings, inputs, outputs, pipes, control flow and host bindings.

It checks every `.ts` file your tsconfig includes, not just the pages you've opened. An error in a lazy route you haven't visited still shows up.

Turn it off with [`typeCheck: false`](configuration). It's also off by default when Vitest runs the plugin.

## Checking with tsrs

`tsgo` is what the plugin installs and runs. `typeChecker: 'tsrs'` runs the same check with [tsrs](https://github.com/oxc-project/tsrs) instead: the Oxc project's Rust port of the TypeScript 7 compiler, with tsc's command line and tsc's output. The plugin hands it the tsconfig it writes for `tsgo`, unchanged, and reads the same `file(line,col): error TSxxxx: message` lines, so errors land in the same places. The repo's end-to-end test plants the same errors and runs against both.

Install tsrs in your app, then name it:

```bash
npm install -D tsrs
```

```ts title="vite.config.ts"
ngp({typeChecker: 'tsrs'})
```

The plugin lists tsrs only as an optional peer dependency, so your app picks the version; the plugin was written against 0.16.0-ts7.1.0-dev.20260929. Without it, the check reports one error naming the option and the install command, in the terminal and the overlay in dev, and `vite build` fails with it. Each checker keeps its own incremental build info, so switching never reads the other's.

**What it buys.** On the repo's bench, from writing a template type error until the dev server's terminal names it, and from removing it until the terminal reports the app clean. Medians of 10 edits per app after 2 warm-ups, measured on 17 October 2026 on an M2 Max with the result in `bench/results/2026-10-17-typecheck-tsrs.json`, tsrs 0.16.0-ts7.1.0-dev.20260929 against `tsgo` 7.0.2:

| | playground (21 components) | 5,000 components |
|---|---:|---:|
| `tsgo`, error shown | 527 ms | 1.56 s |
| `tsrs`, error shown | 508 ms | 1.12 s |
| `tsgo`, error cleared | 570 ms | 1.45 s |
| `tsrs`, error cleared | 562 ms | 1.12 s |

At 5,000 components tsrs takes about 0.4 s off every check, a quarter of the time from edit to error. On the playground the two are within 20 ms of each other: there the 300 ms wait before the check and the watcher's own delay are most of the half second, and the check itself is a tenth of a second or two with either. The `tsgo` figures here are from the same run as the tsrs ones, so they're comparable with each other; the [Performance](performance#type-errors-in-the-dev-server) page's 1.37 s for `tsgo` at 5,000 components came from an earlier run on a quieter machine. Expect the gap to show on apps where the check itself takes a second or more, and not before.

**Where it's weak.**

- **It's pre-1.0.** tsrs is a port in progress, with issues disabled on its repository. It tracks TypeScript 7.1's development branch where `tsgo` is pinned at 7.0.2, so a diagnostic can differ between the two: the same code can pass one and fail the other, or get a different message. The plugin's tests only pin the four planted errors.
- **No Intel Mac.** tsrs ships its binary in a per-platform package: macOS on Apple silicon, and Linux x64 and arm64, glibc and musl. On an Intel Mac the check reports that the platform isn't supported.
- **Another binary.** The package is a Node launcher plus a native binary, 24 MB on macOS arm64, next to the 26 MB `tsgo` the plugin already installs.
- **The check is still whole-program.** tsrs changes the process that runs it, not the shape: every check still loads the whole program, and the 300 ms wait before it starts is the same.

## How it works

ngp can turn each component file into a **type-check block**: plain TypeScript that calls every expression in the template against the component's types. After each expression, a comment like `/*42,47*/` records where it came from in the template.

The plugin asks ngp for the block of every component file, and only regenerates the blocks of files an edit touched. It writes them into Vite's cache directory, with a tsconfig that extends yours and adds the blocks. A block imports your component from your own source file, so TypeScript checks your real code, and its errors in `.ts` files are already in the right place.

Then it runs `tsgo` on that tsconfig, in a child process. For an error inside a block, it finds the nearest span comment, using the same rule as Angular's compiler, and reports the error at that place in the template. Errors that only exist because of how blocks are written, like their functions never being called, are dropped, as `ng build` drops them.

## Where it's weak

- **Every check is a whole-program check.** `tsgo` keeps an incremental cache between runs, but each run still loads the whole program. On the repo's playground, 19 components at the time, a check takes 100–250 ms in the dev server. On a 5,000-component app, a planted template error reached the terminal 1.45 s after the edit, 300 ms of it the wait before the check starts. `ng serve` took 1.66 s for the same error ([Performance](performance#type-errors-in-the-dev-server)). So on a large app expect errors a second or two after the edit, not milliseconds.
- **Startup does extra work on Vite's thread.** The first check generates every component's block, one file at a time, while your first page loads. On the playground's 19 components that took 60 ms. It hasn't been measured on a large app.
- **Your Vite cache directory has to be inside the project.** The check's tsconfig lives there, and TypeScript resolves `types` entries like `vite/client` from it. The default, `node_modules/.vite`, works. If you set `cacheDir` outside the project and your tsconfig lists `types`, every check fails with TS2688.
- **One position differs from `ng build`.** A template given as an expression, like `template: TEMPLATE`, gets its errors at that expression, not inside the string.
- **It installs TypeScript 7.** The plugin depends on `typescript@7.0.2`, under the name `typescript7`, because Angular needs TypeScript 6 under the name `typescript`. That's a 26 MB native binary on macOS arm64.
