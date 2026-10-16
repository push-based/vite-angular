import * as fs from 'node:fs';
import * as path from 'node:path';
import {transformWithOxc, type EnvironmentModuleNode, type Plugin, type ResolvedConfig} from 'vite';
import {NgpCompiler} from './compiler.js';
import {writeEntryTsconfig} from './entry-tsconfig.js';
import {link, LINKER_MARKER} from './linker.js';
import type {Engine} from './ngp-api.js';

export interface NgpPluginOptions {
  /**
   * Directory holding an ngp build: `preprocessor/api.js` and `engines/`. Defaults to the
   * NGP_TOOLCHAIN environment variable.
   */
  toolchain?: string;
  /** Analyzer engine. Defaults to `native`, with no fallback to wasm. */
  engine?: Engine;
  /** The app's tsconfig, relative to Vite's root. Defaults to tsconfig.app.json, else tsconfig.json. */
  tsconfig?: string;
  /** Entry modules, relative to Vite's root. Defaults to `['src/main.ts']`. */
  entries?: string[];
  /**
   * Give the analyzer a generated tsconfig that lists only `entries`, which keeps edits from
   * costing time proportional to project size. Defaults to true.
   */
  entryOnlyTsconfig?: boolean;
  /**
   * Component HMR in the dev server: edits to an external template update the running component
   * in place. Defaults to true. Ignored in builds.
   */
  hmr?: boolean;
}

const TS_MODULE = /\.[cm]?ts$/;

export function ngp(options: NgpPluginOptions = {}): Plugin[] {
  return [compilerPlugin(options), linkerPlugin()];
}

function compilerPlugin(options: NgpPluginOptions): Plugin {
  let config: ResolvedConfig;
  let compiler: Promise<NgpCompiler> | null = null;
  let hmr = false;
  /**
   * Latest update module per component, served at `/@ng/component?c=<id>`. Keyed by the decoded
   * id (`src/app/home.ts@Home`), which is what the `c` query parameter decodes to.
   */
  const componentUpdates = new Map<string, string>();

  function getCompiler(): Promise<NgpCompiler> {
    compiler ??= (async () => {
      const toolchainDir = options.toolchain ?? process.env['NGP_TOOLCHAIN'];
      if (!toolchainDir) {
        throw new Error('vite-plugin-ngp: set the `toolchain` option or NGP_TOOLCHAIN to an ngp build.');
      }
      const tsconfig = resolveTsconfig(config.root, options.tsconfig);
      const entries = (options.entries ?? ['src/main.ts']).map((e) => path.resolve(config.root, e));
      const analyzerTsconfig =
        options.entryOnlyTsconfig === false
          ? tsconfig
          : await writeEntryTsconfig({tsconfig, entries, outDir: path.join(config.cacheDir, 'vite-plugin-ngp')});
      return NgpCompiler.create({
        toolchainDir,
        engine: options.engine ?? 'native',
        tsconfig,
        analyzerTsconfig,
        enableHmr: hmr,
      });
    })();
    return compiler;
  }

  async function closeCompiler() {
    const current = compiler;
    compiler = null;
    (await current?.catch(() => null))?.close();
  }

  return {
    name: 'vite-plugin-ngp',
    // Before Vite's own TypeScript transform: ngp returns TypeScript, and Vite strips the types.
    enforce: 'pre',

    // The same compile-time globals the Angular CLI defines, so Angular can drop dev-only and JIT
    // code. The linker makes every library AOT, so JIT is never needed.
    config(_, env) {
      hmr = env.command === 'serve' && options.hmr !== false;
      return {
        define: {
          ngJitMode: 'false',
          ngHmrMode: String(hmr),
          ...(env.command === 'build' ? {ngDevMode: 'false'} : {}),
        },
      };
    },

    configEnvironment(name, environment) {
      if ((environment.consumer ?? (name === 'client' ? 'client' : 'server')) === 'client') {
        return {define: {ngServerMode: 'false'}};
      }
    },

    configResolved(resolved) {
      config = resolved;
    },

    configureServer(server) {
      server.httpServer?.once('close', closeCompiler);
      if (!hmr) {
        return;
      }
      // Compiled components import their update module from `<module dir>/@ng/component?c=<id>`,
      // once at startup and again after each angular:component-update. No update means an empty
      // module, and that has to be instant: every component on the page asks at startup.
      server.middlewares.use((req, res, next) => {
        if (!req.url?.includes('/@ng/component')) {
          return next();
        }
        const id = new URL(req.url, 'http://localhost').searchParams.get('c');
        res.setHeader('Content-Type', 'text/javascript');
        res.setHeader('Cache-Control', 'no-cache');
        res.end((id && componentUpdates.get(id)) ?? '');
      });
      // Angular's runtime sends this when it can't apply an update.
      server.environments.client.hot.on('angular:invalidate', (data: {id?: string; message?: string}) => {
        config.logger.warn(`[vite-plugin-ngp] HMR failed for ${decodeURIComponent(data.id ?? '?')}: ${data.message ?? ''}. Reloading.`);
        server.environments.client.hot.send({type: 'full-reload'});
      });
    },

    closeBundle() {
      if (config.command === 'build') {
        return closeCompiler();
      }
    },

    transform: {
      filter: {id: {include: TS_MODULE, exclude: [/\.d\.[cm]?ts$/, /\/node_modules\//]}},
      async handler(code, id) {
        const file = cleanId(id);
        const ngp = await getCompiler();
        const result = await ngp.transform(file, code);
        // Freshly compiled code already contains any pending template update.
        const prefix = decodeURIComponent(ngp.componentId(file, ''));
        for (const componentId of componentUpdates.keys()) {
          if (componentId.startsWith(prefix)) {
            componentUpdates.delete(componentId);
          }
        }
        if (!result) {
          return null;
        }
        for (const d of result.diagnostics) {
          const log = {message: `NG${d.code}: ${d.messageText}`, id: d.filePath ?? file, pos: d.span?.start};
          // ts.DiagnosticCategory.Error
          if (d.category === 1) {
            this.error(log);
          } else {
            this.warn(log);
          }
        }
        return {code: result.code, map: result.map};
      },
    },

    // Template edits update the component in place. Every other edit returns the affected modules,
    // and since compiled components don't accept updates, Vite reloads the page.
    async hotUpdate({file, type, read, timestamp}) {
      if (!compiler || type === 'delete' || !(TS_MODULE.test(file) || file.endsWith('.html'))) {
        return;
      }
      const ngp = await compiler;
      const stale = await ngp.update(file, await read(), 'watcher');
      const owner = file.endsWith('.html') ? await ngp.componentForTemplate(file) : null;
      const graph = this.environment.moduleGraph;

      if (owner && hmr && this.environment.name === 'client') {
        try {
          const updates = await ngp.hmrUpdates(owner, file);
          if (updates.length > 0) {
            for (const update of updates) {
              const js = await transformWithOxc(update.code, `${owner}.hmr.ts`, {lang: 'ts'});
              componentUpdates.set(decodeURIComponent(update.id), js.code);
            }
            // Invalidate without reloading, so the next full load compiles the new template.
            for (const mod of graph.getModulesByFile(owner) ?? []) {
              graph.invalidateModule(mod, new Set(), timestamp, true);
            }
            for (const update of updates) {
              this.environment.hot.send({type: 'custom', event: 'angular:component-update', data: {id: update.id, timestamp}});
              config.logger.info(`hmr update ${decodeURIComponent(update.id)}`, {timestamp: true});
            }
            // Returning [] would make Vite reload: it treats every changed .html file with no
            // modules as a page. A node for the template that Vite has never transformed stops
            // update propagation without a reload, which is what "handled" means here.
            const url = '/' + path.relative(config.root, file).split(path.sep).join('/');
            return [await graph.ensureEntryFromUrl(url, false)];
          }
        } catch (error) {
          // Vite drops errors thrown from hotUpdate silently. Say so, and reload instead.
          config.logger.error(`[vite-plugin-ngp] HMR update for ${file} failed, reloading: ${String(error)}`);
        }
      }

      const affected = new Set<EnvironmentModuleNode>();
      for (const f of new Set([...stale, ...(owner ? [owner] : [])])) {
        for (const mod of graph.getModulesByFile(f) ?? []) {
          graph.invalidateModule(mod);
          affected.add(mod);
        }
      }
      if (affected.size === 0) {
        return;
      }
      for (const mod of graph.getModulesByFile(file) ?? []) {
        affected.add(mod);
      }
      return [...affected];
    },
  };
}

/** Runs Angular's linker on library code, both where Vite pre-bundles it and where it doesn't. */
function linkerPlugin(): Plugin {
  const filter = {
    id: {include: /\.[cm]?js$/, exclude: /[\\/]node_modules[\\/]\.vite[\\/]/},
    code: LINKER_MARKER,
  };
  return {
    name: 'vite-plugin-ngp:linker',
    config() {
      // In dev, Vite pre-bundles dependencies with Rolldown, outside the plugin pipeline.
      return {
        optimizeDeps: {
          rolldownOptions: {
            plugins: [{name: 'vite-plugin-ngp:linker', transform: {filter, handler: (code: string, id: string) => link(code, id) as never}}],
          },
        },
      };
    },
    // Production builds, and dependencies Vite serves without pre-bundling.
    transform: {filter, handler: (code, id) => link(code, id) as never},
  };
}

function resolveTsconfig(root: string, configured: string | undefined): string {
  const candidates = configured ? [configured] : ['tsconfig.app.json', 'tsconfig.json'];
  for (const candidate of candidates) {
    const file = path.resolve(root, candidate);
    if (fs.existsSync(file)) {
      return file;
    }
  }
  throw new Error(`vite-plugin-ngp: no tsconfig found in ${root} (tried ${candidates.join(', ')})`);
}

function cleanId(id: string): string {
  return id.replace(/[?#].*$/, '');
}
