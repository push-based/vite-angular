---
title: Getting started
description: Build ngp, run the playground, then add vite-plugin-ngp to your own Angular app.
---

# Getting started

This page takes you from nothing to an Angular app served by Vite through vite-plugin-ngp. It takes about ten minutes, most of it the one-time build of ngp. You'll need to be comfortable pinning exact Angular versions, because ngp is unreleased and only works with the Angular build it came from.

## What you need

| Tool | Version |
|---|---|
| macOS or Linux | Windows only through WSL 2 |
| Node | 26 |
| pnpm | 10 |
| git, curl, a C compiler | any recent version. On macOS, `xcode-select --install` |

You don't need Rust, Bazel or an Angular checkout. The build installs its own Rust inside the repo.

## 1. Build ngp

Angular hasn't published ngp to npm, so the plugin's repo builds it from Angular's source, at a pinned commit. The repo, [push-based/vite-angular](https://github.com/push-based/vite-angular), is private for now, so you need access from [PushBased](https://push-based.io/) to clone it. Then, from its root:

```bash
nvm use
pnpm install
pnpm toolchain
```

`pnpm toolchain` writes ngp into `toolchain/out`. The first run took about 2 minutes on a 12-core M2 Max. Later runs reuse their caches. [Building ngp](building-ngp) explains each step and what to do when one fails.

## 2. Try the playground

```bash
pnpm dev
```

This builds the plugin and starts Vite on a small Angular app at `http://localhost:5173`. Edit a template under `playground/src/app` and the component updates in place, keeping its state.

## 3. Add the plugin to your app

The plugin isn't on npm either. Install it from your clone, after `pnpm build` in the repo root:

```bash
pnpm add -D ../vite-angular/packages/vite-plugin-ngp vite@8.3.4
```

> [!WARNING]
> Pin every `@angular/*` package to exactly `22.3.0-next.2`, the release built from the same commit as ngp. Any other version fails, because ngp imports private APIs from `@angular/compiler-cli`.

```json title="package.json"
{
  "dependencies": {
    "@angular/common": "22.3.0-next.2",
    "@angular/compiler": "22.3.0-next.2",
    "@angular/core": "22.3.0-next.2",
    "@angular/platform-browser": "22.3.0-next.2",
    "@angular/router": "22.3.0-next.2"
  },
  "devDependencies": {
    "@angular/compiler-cli": "22.3.0-next.2",
    "typescript": "6.0.3"
  }
}
```

Then add the plugin to `vite.config.ts`, pointing it at the ngp build:

```ts title="vite.config.ts"
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [ngp({toolchain: '../vite-angular/toolchain/out'})],
});
```

You can also leave out `toolchain` and set the `NGP_TOOLCHAIN` environment variable instead.

## 4. Point Vite at your app

Vite starts from `index.html`, not from `angular.json`. Put one in your project root that loads `src/main.ts`:

```html title="index.html"
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>My app</title>
  </head>
  <body>
    <app-root></app-root>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

Keep `main.ts` as it is.

> [!NOTE]
> Don't import `@angular/compiler`. The plugin links Angular's libraries ahead of time, so the browser never needs the JIT compiler, and importing it adds the whole compiler to your bundle.

```ts title="src/main.ts"
import {bootstrapApplication} from '@angular/platform-browser';
import {App} from './app/app';
import {appConfig} from './app/app.config';

bootstrapApplication(App, appConfig).catch((err) => console.error(err));
```

The plugin reads `tsconfig.app.json`, or `tsconfig.json` if that doesn't exist, for your Angular compiler options. Then run:

```bash
pnpm vite
```

For a production build, run `pnpm vite build`. The output in `dist/` is a static site.

## Next

- [How it works](how-it-works) explains what happens between Vite's request and the compiled module.
- [Configuration](configuration) lists every option.
- [Migrating from ng build](migrating-from-ng-build) says where each angular.json build option goes, if you're moving an existing app.
- [Status and limits](status) says what doesn't work yet. Read it before you try a large app.
