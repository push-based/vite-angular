---
title: Status and limits
description: What vite-plugin-ngp does today, what it doesn't do yet, and where it's weakest.
---

# Status and limits

vite-plugin-ngp is a first version on top of a prototype compiler. This page says exactly what works, so you can decide whether your app can try it. Everything marked as working was checked in the repo's playground or on this site.

## What works

| Piece | Status |
|---|---|
| Per-module compilation | Works, in ngp's optimize mode, from the code Vite hands over |
| Edits in the dev server | Work. Template edits and inline style edits update in place; other edits reload the page |
| Adding, renaming and deleting files | Works. New files compile as they would in a fresh build. Deleting a file that's still used is an error until the file is back. Checked by an automated dev-server test |
| Production builds | Work, through the same transform, with the CLI's build optimizer. The playground's JavaScript is within 2% of `ng build`'s for the same app, and the same size gzipped |
| Linking Angular libraries | Works, in dependency pre-bundling and in builds, with Angular's Babel linker |
| Component HMR | Works for external templates, and for `.ts` edits that only change a component's inline `template` or `styles`. Other `.ts` edits reload, as under `ng serve`, and so does a template saved together with such a `.ts` edit. Changing `templateUrl` or `styleUrl` reloads too, unlike `ng serve` |
| Server rendering and hydration | Works in the dev server and in builds, with the `ssr` option. This site is prerendered that way |
| Vitest with TestBed | Works, with jsdom and zoneless TestBed. A run compiles only the specs it runs and what they import. Watch mode reruns specs after template edits too. See [Testing with Vitest](testing) |
| [Type-checking](type-checking) | Works, for templates and TypeScript, with TypeScript 7 in a separate process. Errors show in the dev server's terminal and overlay, and fail `vite build`. Planted errors land where `ng build` puts them. Checked on this site and the playground; not measured on a large app |

## What doesn't work yet

| Piece | Status |
|---|---|
| External stylesheets | Untested. ngp reads `styleUrl` files and inlines them itself. They aren't Vite CSS modules, so preprocessors and CSS HMR don't apply |
| HTTP status codes from SSR | Missing. `render` returns HTML only, so a not-found page answers 200 when a Node server renders it |
| i18n | Out of scope for now |
| Vitest beyond jsdom | Untried: happy-dom, browser mode, the `node` environment, coverage. `fakeAsync` needs `zone.js`, which the documented setup leaves out |
| Windows | Only through WSL 2, because the ngp build needs a Unix shell |

## Where it's weakest

- **ngp is a prototype, and the plugin uses it as one.** ngp's API isn't public, and the plugin reaches below it in two places to skip work it doesn't need. Any Angular commit can break that, which is why every Angular package is pinned to exactly `22.3.0-next.2`.
- **Nobody can `npm install` it.** You build ngp from Angular's source with a Rust toolchain the build installs for you. That works on macOS and Linux, and it's a blocker for most teams until Angular publishes ngp.
- **File changes are tested on one small app.** Adding, renaming and deleting components and templates is covered by a test on a three-component app, not on a large one. Deleting a component that's still used gives Angular's "is not a known element" error, which names the element, not the missing file. A missing `styleUrl` file isn't reported at all.
- **Type-checking is whole-program.** Every check runs TypeScript 7 over the whole app. That takes 100–250 ms in the dev server on the repo's 19-component playground. A full check of a 5,000-component app took 18.6 s in benchmarks, and the incremental check the plugin runs hasn't been measured there. See [Type-checking](type-checking#where-its-weak).
- **SSR runs two analyzers.** The browser and the server each get their own ngp compiler, because only the browser's has HMR code. A dev server with SSR needs about twice the analyzer memory, and analyzes every edit twice.
- **The build optimizer is a copy of the CLI's.** When `@angular/build` changes its pass, the plugin keeps the old one until someone ports the change. Nothing fails when that happens; only bundle sizes would show it.
- **The linker is the slow one.** It's the Babel-based linker. The Angular CLI has since moved to a faster oxc-based one, which the plugin can't use yet because it's private to `@angular/build`.

## What hasn't been measured

The headline numbers on this site, 164 ms to the first module and about 4 ms per edit at 5,000 components, come from spikes against ngp's API in PushBased's benchmark repo, which isn't public yet. They don't come from this plugin's dev server. The comparison that decides whether the plugin is worth using hasn't run yet: dev-server start to first paint, edit-to-update time, and production build time, against `ng serve`, Analog and `@oxc-angular/vite`, on apps of 100 to 5,000 components.
