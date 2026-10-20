# vite-plugin-ngp

Vite plugin that compiles Angular one module at a time with ngp, the Rust-and-TypeScript preprocessor Angular merged on 8 October 2026. Vite asks for each file when the browser needs it, and no whole-program compile runs first.

**Docs: https://push-based.github.io/vite-plugin-ngp/**

## Before you install

This package is the plugin only. It doesn't contain ngp, and Angular hasn't published ngp, so you build it once from the [plugin's repo](https://github.com/push-based/vite-plugin-ngp) with `pnpm toolchain` and point the plugin at the result. Every `@angular/*` package must be exactly `22.3.0-next.2`, the release built from the same commit as ngp. [Getting started](https://push-based.github.io/vite-plugin-ngp/getting-started/) walks through both.

```ts
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [ngp({toolchain: '../vite-plugin-ngp/toolchain/out'})],
});
```

The [status page](https://push-based.github.io/vite-plugin-ngp/status/) lists what works and what doesn't.

## License

MIT
