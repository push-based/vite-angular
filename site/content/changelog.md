---
title: Changelog
description: What changed in vite-plugin-ngp, newest first, for anyone following the prototype.
---

# Changelog

What changed in vite-plugin-ngp, newest first. The repository is private, so this page is how you find out what landed since you last looked. Every entry links to the page that documents it.

## 17 October 2026

### Editing in the dev server

- A save can no longer be undone by a module Vite read just before it: components compiled afterwards see the saved file. [How it works](how-it-works#handling-an-edit)

### This site

- [Migrating from ng build](migrating-from-ng-build#where-every-option-goes) now says where `localize` and `i18nMissingTranslation` go, since i18n works. It listed them as not yet possible.
- An editing pass over every page: stale counts fixed, and the Server rendering page's prerender timing remeasured on the current 14 pages. [Server rendering](server-rendering#prerendering-for-static-hosting)

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
