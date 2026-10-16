# Playground

A small Angular app that runs on `vite-plugin-ngp`. It has two jobs: show what the plugin can compile, and give anyone changing the plugin a page that breaks visibly when a compiler feature stops working. Each page covers one area of Angular, and every component on it is compiled by ngp when the browser first asks for it.

Run it from the repo root with `pnpm dev`, or build it with `pnpm playground:build`. The [repo README](../README.md) covers the one-time ngp build.

## Pages

| Page | What it exercises | What breaks visibly if the plugin gets it wrong |
|---|---|---|
| Overview | An eager route, `VERSION`, `isDevMode()`, `afterNextRender` | The dev-checks and HMR indicators show the wrong state |
| Signals | `signal`, `computed`, `linkedSignal`, `effect`, `@let`, a custom pure pipe | The counter, the todo filter or the effect log stops updating |
| Control flow | `@if`/`@else if`, `@switch`, `@for` with `$index`/`$first`/`$last`/`$even`, `@empty`, `@defer (on viewport)` with `@placeholder` and `@loading` | Blocks render in the wrong branch; the chart never loads, or `sparkline` gets no chunk of its own in a production build |
| Components | `input()`, `output()`, `model()` with `[(value)]`, `ng-content` slots, a directive with host bindings, `inject()`, pipes from `@angular/common` | Two-way rating loses sync; pipes fail with a JIT error if the linker didn't run |
| Router | Lazy `loadComponent`, child routes, `:slug` bound to an `input()` through `withComponentInputBinding`, `routerLinkActive` | The detail view shows no feature, or the wrong one |
| Styles | `styleUrl` files read by ngp, and `ViewEncapsulation` `Emulated`, `None` and `ShadowDom` side by side | Boxes lose their colors; the underline lands on the wrong boxes |
| Not found | A lazy wildcard route | Unknown URLs show a blank page |

Every page except the overview is lazy-loaded, so each one is a separate module that ngp compiles only when you navigate to it.

## Things the playground taught us

- **Angular copies component styles into every shadow root.** A rule from a `ViewEncapsulation.None` component reaches a `ShadowDom` component too. Global stylesheets don't. The Styles page shows both.
- **Editing a component's `.ts` and `.html` at the same time costs a failed HMR attempt.** The template update is applied against the old class before the `.ts` change arrives, the runtime reports `angular:invalidate`, and the plugin falls back to a full reload. The result is correct, just slower than a single reload.

## Look and feel

Light and dark themes follow the OS by default. The switch in the sidebar overrides it, and the choice is kept in `localStorage` when the browser allows it. Colors are CSS custom properties in [src/styles.css](src/styles.css). Component styles sit next to each component, mostly as `styleUrl` files so that ngp's resource reading gets exercised. Below 900 px the sidebar becomes a drawer.
