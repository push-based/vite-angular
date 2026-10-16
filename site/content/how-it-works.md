---
title: How it works
description: What vite-plugin-ngp does between Vite's request for a module and the compiled Angular code it returns.
---

# How it works

Every other Angular dev server compiles your whole program before it serves a single module. vite-plugin-ngp compiles each file when Vite asks for it, and only that file. This page explains how, for anyone who wants to know what the plugin is doing before trusting it with an app.

## Why per-module compilation was impossible before

ngc, the compiler behind `ng serve` and `ng build`, can't compile one file until it has built a TypeScript program of the whole project and analyzed every decorator in it. So every Angular tool built on ngc works around Vite instead of with it. `ng serve` runs esbuild and uses Vite only to serve the output. `@analogjs/vite-plugin-angular` compiles the program up front and ignores the code Vite passes to its transform.

ngp, which Angular merged on 8 October 2026, splits the compiler in two. A Rust analyzer, built on [oxc](https://oxc.rs), reads decorators and resolves references across files, and it answers per file, on demand. Angular's existing template compiler, in TypeScript, then generates the code. For each file ngp returns plain TypeScript with the decorators compiled away, which is exactly what a Vite transform should return.

## Compiling one module

When the browser asks for a `.ts` file, Vite hands its code to the plugin's `transform` hook. The plugin runs before Vite's own TypeScript transform, and it:

1. Tells the analyzer about the code, if it differs from what the analyzer last saw. Another plugin may have changed it, for example.
2. Calls ngp's `processFile` for that one file, in optimize mode.
3. Returns ngp's TypeScript and a source map. Vite's transform then strips the types, as it does for any TypeScript file.

Files without Angular decorators come back unchanged. One compiler lives as long as the dev server.

The plugin always uses ngp's **optimize mode**, in development and in production. ngp's other mode, local, compiled 745 of 1,089 modules differently when they were compiled one at a time. Components lost `ChangeDetectionStrategy.OnPush`, which changes how an app behaves at runtime. Optimize mode matched a full build for every module.

## Handling an edit

When a file changes, the plugin sends the new content to the analyzer. The analyzer answers with every file whose output may have changed. The plugin drops those files from ngp's cache and invalidates them in Vite's module graph. Vite then asks again for the ones the page still uses.

The Angular CLI's path runs a "delta" pass after each edit, which streams every file in the program again: 465 ms at 5,000 components. The plugin skips it, because Vite's module graph already knows which modules the page still uses.

### Keeping edits cheap in large apps

After every update, ngp's analyzer reloads its tsconfig and walks the whole source tree to re-expand the `include` globs. At 5,000 components that made a one-line edit cost 172 ms. So the plugin gives the analyzer a generated tsconfig that extends yours and lists only the entry points. The analyzer finds every other file by following imports, and the same edit costs about 1 ms, with identical output. Turn this off with [`entryOnlyTsconfig: false`](configuration).

## Component HMR

In the dev server, ngp compiles each component with the same HMR code the Angular CLI's compiler adds. When you edit a component's external template, or only the inline `template` or `styles` in its `.ts` file:

1. The plugin asks ngp for that component's update module, strips its types, and stores it.
2. It sends `angular:component-update` over Vite's HMR channel.
3. Angular's runtime fetches the update from `/@ng/component?c=<id>`, which the plugin serves, and swaps the new template into the running component.

The component keeps its state: a counter at 2 stays at 2 while its heading changes. If the runtime can't apply an update, it says so, and the plugin reloads the page.

For a `.ts` edit, the plugin decides with the same rules as the Angular CLI's dev server. It compares the file before and after the edit, as text. If the only difference is inside the `template` or `styles` value of a component's decorator, those components update in place. In a file with several components, only the ones you edited update. Any other difference reloads the page: a new entry in `imports`, a changed `selector`, an input, a method, an import or a constant at the top of the file. An update can't bring in code the running page doesn't have yet, so those need the reload.

The comparison is strict, and that's deliberate. It doesn't try to tell a harmless change from a real one, so reformatting a method reloads too. Two cases update in place under `ng serve` and reload here: a template kept in a constant outside the decorator, which is a top-level change, and an edit to `templateUrl` or `styleUrl`.

If one save changes both a component's template and its `.ts` file, and the `.ts` change needs a reload, the page reloads once, without trying the template update first. The new template may use a field the running class doesn't have yet. If the `.ts` change only touched inline templates or styles, both update in place. The plugin waits 50 ms after a template edit to see whether the `.ts` file changed too, so template updates arrive 50 ms later than they would otherwise.

## Linking libraries

Angular libraries, Angular's own packages included, ship partially compiled: `ɵɵngDeclareComponent(...)` calls that describe a component without being its runtime code. The linker rewrites them into the final code for your Angular version, as the CLI does. ngp only compiles your own sources, so the plugin runs Angular's linker on every module in `node_modules` that needs it:

- in development, inside Vite's dependency pre-bundling, which runs outside the normal plugin pipeline;
- in production builds and server bundles, in the normal transform. On the server, the plugin bundles every Angular library it finds in your `dependencies`, so the linker sees them too.

Without a linker, the browser would need Angular's JIT compiler to finish compiling libraries at startup. In the playground, linking cut the production bundle from 1,197 kB to 589 kB.

## Compile-time globals

The plugin defines the same globals the Angular CLI does, so the minifier can drop code your build doesn't need:

| Global | Value |
|---|---|
| `ngJitMode` | `false` everywhere, since the linker makes every library ahead-of-time compiled |
| `ngDevMode` | `false` in builds |
| `ngServerMode` | `false` in the browser, `true` in server environments |
| `ngHmrMode` | `true` in the dev server's browser environment |

These took the playground's bundle from 589 kB to 386 kB, and stopped production builds from logging "Angular is running in development mode".
