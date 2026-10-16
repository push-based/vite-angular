import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [
    ngp({
      // ngp isn't on npm: build it in ng-hybrid-preprocessor-bench with `pnpm toolchain`.
      toolchain: process.env.NGP_TOOLCHAIN ?? resolve(import.meta.dirname, '../../ng-hybrid-preprocessor-bench/toolchain/out'),
    }),
  ],
});
