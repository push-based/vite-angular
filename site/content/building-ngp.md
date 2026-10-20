---
title: Building ngp
description: How the repo builds ngp from Angular's source, what each step does, and what to do when one fails.
---

# Building ngp

Angular hasn't published ngp yet, so `pnpm toolchain` builds it from Angular's source, at the commit pinned in `toolchain/versions.env`. Released copies of the plugin carry that build inside the package, so you only need this page when you work in the repo: when the command fails, or when you want to move to a newer Angular. The first build took about 2 minutes on a 12-core M2 Max and takes longer on fewer cores. Its caches use about 1.6 GB of disk.

Everything stays inside the repo. The build installs Rust into `toolchain/.cache/rust`, and it doesn't touch a Rust you already have, your `PATH` or your shell profile.

## What the build does

`pnpm toolchain` runs `toolchain/build.sh`, which does five things in order:

1. **Checks prerequisites.** If anything is missing, it stops before downloading anything and prints the fix.
2. **Fetches ngp's sources** with a sparse fetch of `packages/compiler-cli/preprocessor` and the Cargo files at the pinned commit: about 1,500 files instead of the whole Angular repo.
3. **Installs Rust** with the pinned version and the `wasm32` target, and builds `wasm-bindgen-cli`. This is most of the first build's time.
4. **Compiles ngp's TypeScript backend** with `tsc`, against the `@angular/*` packages `pnpm install` installed. They come from the same commit, which is why every Angular version is pinned exactly.
5. **Builds the analyzer** with Cargo, twice: the native Node addon the plugin uses by default, and the wasm build.

The result:

```text
toolchain/out/preprocessor/        ngp's TypeScript backend (api.js is what the plugin imports)
toolchain/out/engines/native/      ng_analyze.node
toolchain/out/engines/wasm/        ng_analyze.js and ng_analyze_bg.wasm
```

## Check it works

```bash
pnpm test
```

This builds the plugin and compiles every playground module through ngp, once with your tsconfig and once with the plugin's generated one, and checks that the output is identical.

## Rebuilding

| You changed | Run |
|---|---|
| The plugin's source | nothing: `pnpm dev` and `pnpm test` rebuild it |
| `toolchain/versions.env`, to move to a newer Angular commit | update every `@angular/*` pin to the matching version, then `pnpm install` and `pnpm toolchain` |
| Only one engine | `bash toolchain/build-engines.sh native` (or `wasm`) |

To start over, delete `toolchain/.cache` and `toolchain/out`.

## The build inside the package

A release carries ngp in `packages/vite-plugin-ngp/ngp`: the backend, the wasm engine, and native engines in `engines/native/<platform>-<arch>/` for `darwin-arm64`, `darwin-x64`, `linux-x64` and `linux-arm64`. The Publish workflow builds each native engine on its own runner and assembles them with `toolchain/bundle.mjs`. The Linux ones are built on Ubuntu 22.04 and link against its glibc 2.35, so they don't load on older distros or on musl.

To try the bundled layout locally, with only this machine's engine:

```bash
node toolchain/bundle.mjs --host-only
```

The plugin then loads it when neither `toolchain` nor `NGP_TOOLCHAIN` is set. Delete `packages/vite-plugin-ngp/ngp` to go back. The package's `prepack` refuses to pack a bundle that's missing any platform, so this can't end up in a release.

## When it fails

- **"Can't build ngp yet"** comes from the prerequisite check. Each line names its fix.
- **`linker 'cc' not found`** or a missing `stdlib.h`: the C compiler isn't set up. On macOS, rerun `xcode-select --install`.
- **The fetch fails**: the build needs network access to github.com, static.rust-lang.org and crates.io.
- **`vite-plugin-ngp: ... not found`** or **`no ngp build found`** when Vite starts: the plugin can't find the build. Run `pnpm toolchain`, or set `NGP_TOOLCHAIN` to an ngp build somewhere else.
- **`no native ngp engine for <platform>`**: the build has no native engine for this machine, as on Alpine. Set `engine: 'wasm'`, or run `pnpm toolchain` on this machine and point `toolchain` at the result.
- **TypeScript errors while compiling the backend**: an `@angular/*` package doesn't match the pinned version. Run `pnpm install` and check that no pin drifted.

The repo's CI runs this whole build on a clean Ubuntu machine for every push. If it passes there and fails for you, the difference is something on your machine, most often the C compiler or network access.
