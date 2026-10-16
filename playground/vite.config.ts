import {resolve} from 'node:path';
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [
    ngp({
      // ngp isn't on npm: `pnpm toolchain` in the repo root builds it into toolchain/out.
      toolchain: process.env.NGP_TOOLCHAIN ?? resolve(import.meta.dirname, '../toolchain/out'),
    }),
  ],
});
