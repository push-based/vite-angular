import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isRunnableDevEnvironment,
  transformWithOxc,
  type EnvironmentModuleNode,
  type Plugin,
  type ResolvedConfig,
} from 'vite';
import {findAngularLibraries, packagePattern} from './angular-libraries.js';
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
  /**
   * Entry modules, relative to Vite's root. Defaults to `src/main.ts`, plus `src/main.server.ts`
   * when it exists.
   */
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
  /**
   * Server-side rendering. The entry module default-exports
   * `render(url: string, document: string): Promise<string>`, which turns index.html into the
   * rendered page. In dev, the plugin renders every page request through it. `vite build` then
   * builds the client into `dist/client` and the entry into `dist/server`. `true` means the entry
   * is `src/main.server.ts`. Off by default.
   */
  ssr?: boolean | {entry?: string};
}

type Consumer = 'client' | 'server';

const TS_MODULE = /\.[cm]?ts$/;

export function ngp(options: NgpPluginOptions = {}): Plugin[] {
  return [compilerPlugin(options), linkerPlugin()];
}

function compilerPlugin(options: NgpPluginOptions): Plugin {
  let config: ResolvedConfig;
  /**
   * One compiler per consumer. Server environments get their own, compiled without HMR: HMR code
   * imports update modules from URLs that only a browser can load.
   */
  const compilers = new Map<Consumer, Promise<NgpCompiler>>();
  let hmr = false;
  let root = process.cwd();
  const ssrOptions = options.ssr === true ? {} : options.ssr || null;
  const ssrEntry = ssrOptions ? (ssrOptions.entry ?? 'src/main.server.ts') : null;
  /**
   * Latest update module per component, served at `/@ng/component?c=<id>`. Keyed by the decoded
   * id (`src/app/home.ts@Home`), which is what the `c` query parameter decodes to.
   */
  const componentUpdates = new Map<string, string>();

  function getCompiler(consumer: Consumer): Promise<NgpCompiler> {
    let compiler = compilers.get(consumer);
    compiler ??= (async () => {
      const toolchainDir = options.toolchain ?? process.env['NGP_TOOLCHAIN'];
      if (!toolchainDir) {
        throw new Error('vite-plugin-ngp: set the `toolchain` option or NGP_TOOLCHAIN to an ngp build.');
      }
      const tsconfig = resolveTsconfig(config.root, options.tsconfig);
      const entries = (options.entries ?? ['src/main.ts', 'src/main.server.ts'])
        .map((e) => path.resolve(config.root, e))
        .filter((e) => options.entries || fs.existsSync(e));
      const analyzerTsconfig =
        options.entryOnlyTsconfig === false
          ? tsconfig
          : await writeEntryTsconfig({tsconfig, entries, outDir: path.join(config.cacheDir, 'vite-plugin-ngp')});
      return NgpCompiler.create({
        toolchainDir,
        engine: options.engine ?? 'native',
        tsconfig,
        analyzerTsconfig,
        enableHmr: hmr && consumer === 'client',
      });
    })();
    compilers.set(consumer, compiler);
    return compiler;
  }

  async function closeCompilers() {
    const current = [...compilers.values()];
    compilers.clear();
    for (const compiler of current) {
      (await compiler.catch(() => null))?.close();
    }
  }

  return {
    name: 'vite-plugin-ngp',
    // Before Vite's own TypeScript transform: ngp returns TypeScript, and Vite strips the types.
    enforce: 'pre',

    // The same compile-time globals the Angular CLI defines, so Angular can drop dev-only and JIT
    // code. The linker makes every library AOT, so JIT is never needed.
    config(userConfig, env) {
      hmr = env.command === 'serve' && options.hmr !== false;
      root = path.resolve(userConfig.root ?? process.cwd());
      return {
        define: {
          ngJitMode: 'false',
          ngHmrMode: String(hmr),
          ...(env.command === 'build' ? {ngDevMode: 'false'} : {}),
        },
        ...(ssrEntry && {
          // `vite build` builds every environment: the browser bundle and the server entry.
          builder: {},
          environments: {
            client: {build: {outDir: 'dist/client'}},
            ssr: {build: {outDir: 'dist/server', rolldownOptions: {input: ssrEntry}}},
          },
        }),
      };
    },

    configEnvironment(name, environment) {
      if ((environment.consumer ?? (name === 'client' ? 'client' : 'server')) === 'client') {
        return {define: {ngServerMode: 'false'}};
      }
      // Server environments externalize node_modules by default, and Node would then load Angular
      // libraries unlinked, which needs the JIT compiler. Bundling them runs the linker, and keeps
      // a single copy of @angular/core.
      const noExternal = [/^@angular\//, ...findAngularLibraries(root).map(packagePattern)];
      return {define: {ngServerMode: 'true', ngHmrMode: 'false'}, resolve: {noExternal}};
    },

    configResolved(resolved) {
      config = resolved;
    },

    configureServer(server) {
      server.httpServer?.once('close', closeCompilers);
      // Runs after Vite's own middlewares, once its SPA fallback has rewritten a page request to
      // /index.html, and before Vite would serve that file as it is.
      const renderPages = () => {
        if (!ssrEntry) {
          return;
        }
        server.middlewares.use(async (req, res, next) => {
          const accept = req.headers.accept ?? '';
          if (req.method !== 'GET' || !cleanId(req.url ?? '').endsWith('.html') || !accept.includes('text/html')) {
            return next();
          }
          const url = req.originalUrl ?? req.url ?? '/';
          try {
            const environment = server.environments.ssr;
            if (!isRunnableDevEnvironment(environment)) {
              throw new Error('the ssr environment has no module runner');
            }
            const template = await fs.promises.readFile(path.join(config.root, cleanId(req.url!)), 'utf8');
            const document = await server.transformIndexHtml(url, template, req.originalUrl);
            const entry = await environment.runner.import<{default: (url: string, document: string) => Promise<string>}>(ssrEntry);
            const html = await entry.default(url, document);
            res.setHeader('Content-Type', 'text/html');
            res.end(html);
          } catch (error) {
            server.ssrFixStacktrace(error as Error);
            next(error);
          }
        });
      };
      if (!hmr) {
        return renderPages;
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
      return renderPages;
    },

    closeBundle() {
      if (config.command === 'build') {
        return closeCompilers();
      }
    },

    transform: {
      filter: {id: {include: TS_MODULE, exclude: [/\.d\.[cm]?ts$/, /\/node_modules\//]}},
      async handler(code, id) {
        const file = cleanId(id);
        const ngp = await getCompiler(this.environment.config.consumer);
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
      // Each environment updates its own compiler, so the server renders the edit too.
      const compiler = compilers.get(this.environment.config.consumer);
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
