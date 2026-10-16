---
title: Changelog
description: What changed in vite-plugin-ngp, newest first, for anyone following the prototype.
---

# Changelog

What changed in vite-plugin-ngp, newest first. The repository is private, so this page is how you find out what landed since you last looked. Every entry links to the page that documents it.

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
- One save that changes a component's class and its template reloads once, instead of applying a template the class can't run yet.
- Deleted files and missing templates no longer break the dev server.

### Styles, type-checking and tests

- Component stylesheets (`styleUrl`, `styleUrls`) go through Vite's CSS pipeline, so Sass, PostCSS and CSS HMR apply. [Component styles](styles)
- Templates and TypeScript are type-checked with TypeScript 7 over ngp's type-check blocks, in a separate process, with errors in the terminal and the overlay. New option: `typeCheck`. [Type-checking](type-checking)
- Angular specs run under Vitest, compiled ahead of time with ngp. [Testing with Vitest](testing)

### Server rendering

- New option `ssr`: pages render on the server in the dev server, and `vite build` builds a server bundle beside the browser one. [Server rendering](server-rendering)
- Server builds bundle and link every Angular library in your `dependencies`. [Server rendering](server-rendering#what-the-plugin-does)

### This site

- Docs at https://push-based.github.io/vite-angular/, built with the plugin itself and prerendered with Angular SSR. They redeploy on every push.
- Dark theme, copy buttons, heading links, the file name on each snippet, and `llms.txt` for AI assistants.
