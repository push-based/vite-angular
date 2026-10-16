# vite-angular

A Vite plugin that compiles Angular one module at a time with ngp, Angular's new Rust-and-TypeScript preprocessor. Vite owns the module graph, and no whole-program compile runs before the first module is served.

**Docs: https://push-based.github.io/vite-angular/**

> **Status:** a first version. Per-module compilation, component HMR for template edits, server-side rendering with hydration, and production builds work in the playground. Angular libraries are linked at build time. External styles and type-checking are still missing. [docs/design.md](docs/design.md) has the details.

## Layout

| Path | What it is |
|---|---|
| [packages/vite-plugin-ngp](packages/vite-plugin-ngp) | The plugin |
| [playground](playground) | A small standalone Angular app that uses it |
| [toolchain](toolchain) | Builds ngp from Angular's source |
| [site](site) | The docs site: an Angular app compiled by the plugin, prerendered with Angular SSR, deployed to GitHub Pages |
| [docs/building.md](docs/building.md) | How to build everything from a fresh clone |
| [docs/design.md](docs/design.md) | How the plugin works, what's missing, and where it's weak |
| [docs/decisions.md](docs/decisions.md) | Each design choice, with its reasons and costs |

## Building it

Angular hasn't published ngp yet, so this repo builds it from Angular's source. One command does that, with no Rust or Bazel needed beforehand. You need macOS or Linux, Node 26, pnpm 10, git, curl and a C compiler. From the repo root:

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

The dev server renders every page on the server and hydrates it in the browser. For the production build, run `pnpm playground:build`, then `pnpm --filter playground start` to serve it at http://localhost:4000.

`pnpm toolchain` builds ngp into `toolchain/out` (about 2 minutes the first time on an M2 Max). `pnpm dev` builds the plugin and starts Vite on the playground at http://localhost:5173. [docs/building.md](docs/building.md) explains each step, how to check the build, how to move to a newer Angular commit, and what to do when something fails.

## Writing docs

The docs site is the documentation users read. Anything you add or change that a user of the plugin would see goes into [site/content](site/content) in the same commit, and the commit gets pushed: every push to `main` redeploys the site. [CLAUDE.md](CLAUDE.md) has the table of which page covers what. Run `pnpm site:build` to check it builds, and `pnpm site:dev` to work on it with live reload.

[docs/design.md](docs/design.md) and [docs/decisions.md](docs/decisions.md) are for people working on the plugin: record each design choice in the decision log as you make it.

Docs follow [Clarity](https://clarity.addy.ie/). Write for one reader, be specific enough to be wrong, take a position and say where it's weak.
