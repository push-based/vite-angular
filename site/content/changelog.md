---
title: Changelog
description: What changed in vite-plugin-ngp, newest first, for anyone following the prototype.
---

# Changelog

What changed in vite-plugin-ngp, newest first. The plugin isn't on npm, so there are no releases: this page is how you find out what landed since you last looked. Every entry links to the page that documents it.

## 17 October 2026

### Docs site

- The site has search. Press ⌘K (Ctrl+K off a Mac) or the search button in the header, and it finds any page and the section of it that matches, such as `allowedHosts` in [Server rendering](server-rendering#the-server-entry). The index is built with Pagefind when the site is, and nothing of it loads until you open search: about 165 kB compressed then, most of it Pagefind's WebAssembly and the index.
- A link to a section, from "On this page", from search or from a URL with a `#`, leaves the heading below the header instead of under it, on a phone too. Try [What it checks](type-checking#what-it-checks).

### Type-checking

- The first type-check of a dev-server session waits until the server is idle, half a second with no request and no module compile, instead of starting one second after the server starts. Generating every component's type-check block ran on Vite's thread while the first page was compiling; on Super Productivity that was 0.67 s of the thread, and first paint went from 6.72 s to 6.00 s on a warm restart once the check waits. The first errors show up later, after the page instead of alongside it. Checks after edits are unchanged. [Type-checking](type-checking#what-you-see)

### Server rendering

- The dev server pre-bundles and caches the server's Angular libraries, in `node_modules/.vite/deps_ssr`, instead of linking and transforming them on every start. On the playground the first server-rendered page after a warm restart went from 1.3 s to 0.74 s. The server bundle has no source maps: a stack trace from inside Angular points into the readable pre-bundle. [Server rendering](server-rendering#what-the-plugin-does)

### Editing in the dev server

- A save can no longer be undone by a module Vite read just before it: components compiled afterwards see the saved file. [How it works](how-it-works#handling-an-edit)
- Template edits reach the page about 50 ms sooner on macOS. The plugin's 50 ms wait for the rest of a save now counts from when the template was written, not from when Vite's watcher reported it, and the watcher usually reports later than that. At 1,000 components the median template edit went from 169 ms to 120 ms. [How it works](how-it-works#component-hmr), [Performance](performance#template-edits)
- A class edit could reload the page twice, a second after the first reload. That happened when the plugin read the `.ts` file between a save truncating it and writing it. The plugin now waits out an empty read, the way Vite does. [How it works](how-it-works#component-hmr)
- `DEBUG=vite-plugin-ngp` also logs how long each step of a template update took. [Configuration](configuration#what-the-plugin-sets-for-you)

### Performance

- Every number on the [Performance](performance) page was measured again on the current plugin, in one run on 17 October: cold starts, restarts, edits, type errors, builds and bundle sizes for all four toolchains on all four apps, instead of the 16 October run with the plugin's edit row patched in from a later one. The results barely moved, which is the point: at 5,000 components the plugin shows the first page in 1.74 s where `ng serve` takes 28.3 s, a template edit lands in about 120 ms, and a build takes 20.2 s against 30.1 s. [Performance](performance)
- The page has a [Memory](performance#memory) section now. The generated apps were measured for memory the way the real apps are: at 5,000 components the plugin's dev server holds 1.0 GB after a restart where `ng serve` holds 6.0 GB, and 1.4 GB after the edits where `ng serve` holds 6.6 GB. Builds are even: 5.0 GB against 5.1 GB. [Performance](performance#memory)
- Both benchmark pages have figures. Each table of medians now has a chart above it, one bar per tool and app on a shared scale, with the plugin in violet and the fastest edit marked. They're drawn from the result files by `node bench/charts.mjs` and follow the site's dark theme. [Performance](performance#starting-the-dev-server), [Benchmarks on real apps](benchmarks#starting-the-dev-server)
- Bundle size has figures too: all the JavaScript a build writes and the initial part, gzipped, per tool and app. On the generated apps the plugin's output is within 3% of `ng build`'s; on Super Productivity it's 10% smaller than the CLI's, on Ghostfolio 3% larger. [Performance](performance#bundle-size), [Benchmarks on real apps](benchmarks#bundle-size)

### Benchmarks on real apps

- A new page, [Benchmarks on real apps](benchmarks): the plugin against the Angular CLI on Super Productivity and against Nx on Ghostfolio, two open-source apps, for dev-server starts, edits, production builds and memory, measured on GitHub's runners and on a laptop. On GitHub's 4-core runners the plugin restarts Ghostfolio's dev server in 4.5 s where Nx takes 21 s, updates a template in about 130–150 ms on both apps where the CLIs take 3.3–3.7 s, builds Super Productivity in 18 s where `ng build` takes 32 s, and holds a third to a half of the CLIs' memory while you work; its cold start of Super Productivity, 21.4 s against 23.1 s, is the one number that barely moves. It also lists what each app needed to run on a per-file compiler at all. The `bench-real` workflow reruns it on demand.
- [Status and limits](status#what-has-been-measured-and-what-hasnt) now says real apps, Linux and memory have been measured, and what still hasn't.

### Internationalization

- A translation file with a unit the parser can't read in full, such as a `{` in a translation that isn't an ICU expression, no longer fails `vite build`. The error is logged and the build goes on, as `ng build` does with the same file. Ghostfolio's Catalan translations have two such units. [Internationalization](i18n#the-build)

### This site

- A new page, [Compared with alternatives](comparison), sets vite-plugin-ngp next to `ng serve`, Analog (its default path and `fastCompile`) and `@oxc-angular/vite`: when each compiles, whose compiler it runs, type-checking, HMR, SSR, linking, and how you get it, with a source for every claim and where the plugin is weaker.
- [Migrating from ng build](migrating-from-ng-build#where-every-option-goes) now says where `localize` and `i18nMissingTranslation` go, since i18n works. It listed them as not yet possible.
- An editing pass over every page: stale counts fixed, and the Server rendering page's prerender timing remeasured on the current 14 pages. [Server rendering](server-rendering#prerendering-for-static-hosting)
- The repo, [push-based/vite-angular](https://github.com/push-based/vite-angular), is public. [Getting started](getting-started#1-build-ngp) now starts with `git clone` instead of asking for access, and no page calls the repo private any more.
- Tables no longer break option names or types mid-word. The [Options](configuration#options) table puts each option's type and default in one cell so it fits the docs column, and on a phone every table with three or more columns stacks each row into labeled lines.

## 16 October 2026

The first day: from an empty repo to a plugin that compiles, serves, renders, tests and type-checks Angular through ngp.

### Compiling and building

- Every `.ts` module compiles on request with ngp's optimize mode, from the code Vite hands over, with no whole-program pass first. [How it works](how-it-works#compiling-one-module)
- Angular libraries are linked, in dependency pre-bundling and in builds, so the browser never needs the JIT compiler. [How it works](how-it-works#linking-libraries)
- The plugin defines Angular's compile-time globals (`ngDevMode`, `ngJitMode`, `ngServerMode`, `ngHmrMode`) the way the CLI does. [How it works](how-it-works#compile-time-globals)
- `vite build` runs Angular's build optimizer, which brings the playground's JavaScript to within 2% of `ng build`'s. [How it works](how-it-works#the-build-optimizer)
- ngp builds inside the repo with one command, `pnpm toolchain`, with no Rust installed beforehand. [Building ngp](building-ngp)

### Editing in the dev server

- Component HMR: an external template edit updates the running component in place, keeping its state. [How it works](how-it-works#component-hmr)
- A `.ts` edit that only changes a component's inline `template` or `styles` updates in place too, with the CLI's rules for what's safe. [How it works](how-it-works#component-hmr)
- One save that changes a component's class and its template reloads once, instead of applying a template the class can't run yet. That holds however far apart, and however often, the watcher reports the two files, as macOS's does. [How it works](how-it-works#component-hmr)
- Adding, renaming and deleting files compiles as a fresh build would. Deleting a file that's still used is an error until it's back, and a missing `templateUrl` file reports `NG2008` instead of rendering a blank component. [How it works](how-it-works#handling-an-edit)

### Styles, type-checking and tests

- Component stylesheets (`styleUrl`, `styleUrls`) go through Vite's CSS pipeline, so Sass, PostCSS and CSS HMR apply. [Component styles](styles)
- Templates and TypeScript are type-checked with TypeScript 7 over ngp's type-check blocks, in a separate process, with errors in the terminal and the overlay. New option: `typeCheck`. [Type-checking](type-checking)
- Angular specs run under Vitest, compiled ahead of time with ngp. [Testing with Vitest](testing)

### Moving from ng build

- New options `fileReplacements`, `budgets` and `polyfills`, in angular.json's shapes. Replacements reach ngp's analyzer too, budgets print the CLI's messages and fail the build on errors, and zone.js apps get `async`/`await` rewritten so change detection still runs after an `await`. Every other build option is mapped to Vite config. [Migrating from ng build](migrating-from-ng-build)

### Internationalization

- New option `i18n`: Angular's `i18n` attributes and `$localize`, with a dev server in one locale and a `vite build` that writes one translated folder per locale, server bundles included. [Internationalization](i18n)
- `ngp-extract-i18n` writes the app's messages as XLIFF 1.2 or 2.0, XMB, JSON or ARB, like `ng extract-i18n`. [Internationalization](i18n#extract-the-messages)
- The compiler reads `enableI18nLegacyMessageIdFormat` and `i18nNormalizeLineEndingsInICUs` from `angularCompilerOptions`, and the plugin defines `ngI18nClosureMode`, so message ids match `ng build`'s. [Internationalization](i18n#mark-text-for-translation)

### Server rendering

- New option `ssr`: pages render on the server in the dev server, and `vite build` builds a server bundle beside the browser one. [Server rendering](server-rendering)
- Server builds bundle and link every Angular library in your `dependencies`. [Server rendering](server-rendering#what-the-plugin-does)

### Performance

- The first end-to-end numbers, against `ng serve`, Analog and `@oxc-angular/vite`: at 5,000 components the plugin shows the first page in 1.9 s where `ng serve` takes 28.5 s, and a template edit in about 150 ms where `ng serve` takes 1.8 s. The harness is in the repo's `bench/` folder. [Performance](performance)

### This site

- Docs at https://push-based.github.io/vite-angular/, built with the plugin itself and prerendered with Angular SSR. They redeploy on every push.
- Dark theme, copy buttons, heading links, the file name on each snippet, and `llms.txt` for AI assistants.
