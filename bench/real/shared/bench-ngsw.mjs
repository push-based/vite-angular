// Angular's service worker for a `vite build`, the way `ng build` adds it with serviceWorker: true.
//
// Super Productivity and Ghostfolio both register `ngsw-worker.js` in production. The Angular CLI
// writes it after the build: it runs @angular/service-worker's generator over the output to write
// ngsw.json, the manifest of hashed files, and copies the worker script next to it. vite-plugin-ngp
// has no service-worker option, so without this the page registers a script that isn't there,
// logs an error, and runs without offline support. This does what the CLI does, after Vite has
// written every file, once per output folder: the build's, or one per locale.

import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

/** What @angular/service-worker's Generator reads the output through, like its own CLI's. */
class NodeFilesystem {
  constructor(base) {
    this.base = base;
  }
  async list(dir) {
    const out = [];
    for (const e of fs.readdirSync(this.canonical(dir), {withFileTypes: true})) {
      const p = path.posix.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await this.list(p)));
      else out.push(p);
    }
    return out;
  }
  async read(p) {
    return fs.readFileSync(this.canonical(p), 'utf8');
  }
  async hash(p) {
    return createHash('sha1').update(fs.readFileSync(this.canonical(p))).digest('hex');
  }
  async write(p, contents) {
    fs.writeFileSync(this.canonical(p), contents);
  }
  canonical(p) {
    return path.posix.join(this.base, p);
  }
}

/**
 * @param {{root: string, config: string, localized?: boolean}} o
 *   root: the app; config: its ngsw-config.json, relative to root; localized: one folder per
 *   locale under outDir, each with its own base href, as the plugin's i18n option writes them.
 */
export function angularServiceWorker({root, config, localized = false}) {
  const require = createRequire(path.join(root, 'package.json'));
  const swPkg = path.dirname(require.resolve('@angular/service-worker/package.json'));
  const {Generator} = require('@angular/service-worker/config');
  const ngswConfig = JSON.parse(fs.readFileSync(path.join(root, config), 'utf8'));
  let outDir;
  let apply = false;
  return {
    name: 'bench:angular-service-worker',
    apply: 'build',
    configResolved(c) {
      // The browser build only: a server build (ssr) has no page to register a worker from.
      apply = !c.build.ssr;
      outDir = path.resolve(c.root, c.build.outDir);
    },
    closeBundle: {
      // After vite-plugin-ngp has written the locale folders.
      sequential: true,
      order: 'post',
      async handler() {
        if (!apply || !fs.existsSync(path.join(outDir, localized ? '' : 'index.html'))) return;
        const folders = localized
          ? fs.readdirSync(outDir, {withFileTypes: true}).filter((e) => e.isDirectory() && fs.existsSync(path.join(outDir, e.name, 'index.html'))).map((e) => e.name)
          : [''];
        const t0 = performance.now();
        for (const folder of folders) {
          const dir = path.join(outDir, folder);
          const filesystem = new NodeFilesystem(dir);
          const manifest = await new Generator(filesystem, folder ? `/${folder}/` : '/').process(ngswConfig);
          await filesystem.write('/ngsw.json', JSON.stringify(manifest, null, 2));
          fs.copyFileSync(path.join(swPkg, 'ngsw-worker.js'), path.join(dir, 'ngsw-worker.js'));
          fs.copyFileSync(path.join(swPkg, 'safety-worker.js'), path.join(dir, 'safety-worker.js'));
          fs.copyFileSync(path.join(swPkg, 'safety-worker.js'), path.join(dir, 'worker-basic.min.js'));
        }
        console.log(`[bench:angular-service-worker] ngsw.json for ${folders.length} folder(s) in ${Math.round(performance.now() - t0)} ms`);
      },
    },
  };
}
