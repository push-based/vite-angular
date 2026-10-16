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

`vite build` runs the same check and fails if there's any error, with the same list. On this site (4 components) and on the repo's playground (19), the check adds about 110 ms to the build.

## What it checks

The same things `ng build` checks:

- Your TypeScript, with your tsconfig's options, including `strict` and `noUnusedLocals`.
- Every component's template, with your `strictTemplates` setting: bindings, inputs, outputs, pipes, control flow and host bindings.

It checks every `.ts` file your tsconfig includes, not just the pages you've opened. An error in a lazy route you haven't visited still shows up.

Turn it off with [`typeCheck: false`](configuration). It's also off by default when Vitest runs the plugin.

## How it works

ngp can turn each component file into a **type-check block**: plain TypeScript that calls every expression in the template against the component's types. After each expression, a comment like `/*42,47*/` records where it came from in the template.

The plugin asks ngp for the block of every component file, and only regenerates the blocks of files an edit touched. It writes them into Vite's cache directory, with a tsconfig that extends yours and adds the blocks. A block imports your component from your own source file, so TypeScript checks your real code, and its errors in `.ts` files are already in the right place.

Then it runs `tsgo` on that tsconfig, in a child process. For an error inside a block, it finds the nearest span comment, using the same rule as Angular's compiler, and reports the error at that place in the template. Errors that only exist because of how blocks are written, like their functions never being called, are dropped, as `ng build` drops them.

## Where it's weak

- **Every check is a whole-program check.** `tsgo` keeps an incremental cache between runs, but each run still loads the whole program. On the repo's playground, 19 components, a check takes 100–250 ms in the dev server. On a 5,000-component app, a planted template error reached the terminal 1.45 s after the edit, 300 ms of it the wait before the check starts. `ng serve` took 1.66 s for the same error ([Performance](performance#type-errors-in-the-dev-server)). So on a large app expect errors a second or two after the edit, not milliseconds.
- **Startup does extra work on Vite's thread.** The first check generates every component's block, one file at a time, while your first page loads. On the playground's 19 components that took 60 ms. It hasn't been measured on a large app.
- **Your Vite cache directory has to be inside the project.** The check's tsconfig lives there, and TypeScript resolves `types` entries like `vite/client` from it. The default, `node_modules/.vite`, works. If you set `cacheDir` outside the project and your tsconfig lists `types`, every check fails with TS2688.
- **One position differs from `ng build`.** A template given as an expression, like `template: TEMPLATE`, gets its errors at that expression, not inside the string.
- **It installs TypeScript 7.** The plugin depends on `typescript@7.0.2`, under the name `typescript7`, because Angular needs TypeScript 6 under the name `typescript`. That's a 26 MB native binary on macOS arm64.
