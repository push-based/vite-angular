```ts
// vite.config.ts
import {defineConfig} from 'vite';
import {ngp} from 'vite-plugin-ngp';

export default defineConfig({
  plugins: [ngp({toolchain: '../vite-angular/toolchain/out'})],
});
```
