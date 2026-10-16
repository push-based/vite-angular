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
| Edits in the dev server | Work. Template edits update in place; other edits reload the page |
| Production builds | Work, through the same transform. No build optimizer yet |
| Linking Angular libraries | Works, in dependency pre-bundling and in builds, with Angular's Babel linker |
| Component HMR | Works for external templates. `.ts` edits reload |
| Server rendering and hydration | Works in the dev server and in builds, with the `ssr` option. This site is prerendered that way |

## What doesn't work yet

| Piece | Status |
|---|---|
| Template type-checking | Missing. Run `tsc` or `tsgo` on its own. ngp can write type-check files for it, and the plugin doesn't use them yet |
| External stylesheets | Untested. ngp reads `styleUrl` files and inlines them itself. They aren't Vite CSS modules, so preprocessors and CSS HMR don't apply |
| HTTP status codes from SSR | Missing. `render` returns HTML only, so a not-found page answers 200 when a Node server renders it |
| i18n, Vitest | Out of scope for now |
| Windows | Only through WSL 2, because the ngp build needs a Unix shell |

## Where it's weakest

- **ngp is a prototype, and the plugin uses it as one.** ngp's API isn't public, and the plugin reaches below it in two places to skip work it doesn't need. Any Angular commit can break that, which is why every Angular package is pinned to exactly `22.3.0-next.2`.
- **Nobody can `npm install` it.** You build ngp from Angular's source with a Rust toolchain the build installs for you. That works on macOS and Linux, and it's a blocker for most teams until Angular publishes ngp.
- **New files are untested.** The analyzer should find a new file through the import that adds it. Edits to existing files have been checked, adding files hasn't.
- **SSR runs two analyzers.** The browser and the server each get their own ngp compiler, because only the browser's has HMR code. A dev server with SSR needs about twice the analyzer memory, and analyzes every edit twice.
- **The linker is the slow one.** It's the Babel-based linker. The Angular CLI has since moved to a faster oxc-based one, which the plugin can't use yet because it's private to `@angular/build`.

## What hasn't been measured

The headline numbers on this site, 164 ms to the first module and about 4 ms per edit at 5,000 components, come from spikes against ngp's API in PushBased's benchmark repo, which isn't public yet. They don't come from this plugin's dev server. The comparison that decides whether the plugin is worth using hasn't run yet: dev-server start to first paint, edit-to-update time, and production build time, against `ng serve`, Analog and `@oxc-angular/vite`, on apps of 100 to 5,000 components.
