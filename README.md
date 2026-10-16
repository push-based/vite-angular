# vite-angular

A Vite plugin that compiles Angular one module at a time with ngp, Angular's new Rust-and-TypeScript preprocessor. Vite owns the module graph, and no whole-program compile runs before the first module is served.

> **Status:** a first version. Per-module compilation, edits and production builds work in the playground. Component HMR, the `node_modules` linker, external styles and type-checking are still missing. [docs/design.md](docs/design.md) has the details.

## Layout

| Path | What it is |
|---|---|
| [packages/vite-plugin-ngp](packages/vite-plugin-ngp) | The plugin |
| [playground](playground) | A small standalone Angular app that uses it |
| [docs/design.md](docs/design.md) | How the plugin works, what's missing, and where it's weak |
| [docs/decisions.md](docs/decisions.md) | Each design choice, with its reasons and costs |

## Running the playground

ngp isn't on npm, so build it first in [ng-hybrid-preprocessor-bench](https://github.com/push-based/ng-hybrid-preprocessor-bench), checked out next to this repo:

```bash
cd ../ng-hybrid-preprocessor-bench && pnpm install && pnpm toolchain
```

Then, in this repo, on Node 24 from `.nvmrc`:

```bash
nvm use
```

```bash
pnpm install
```

```bash
pnpm dev
```

`pnpm dev` builds the plugin and starts Vite on the playground. `pnpm playground:build` runs a production build instead. If the bench repo lives somewhere else, set `NGP_TOOLCHAIN` to its `toolchain/out` directory.

## Writing docs

Docs in this repo follow [Clarity](https://clarity.addy.ie/). Write for one reader, be specific enough to be wrong, take a position and say where it's weak. Record each design choice in [docs/decisions.md](docs/decisions.md) as you make it.
