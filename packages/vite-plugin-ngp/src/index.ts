import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  isRunnableDevEnvironment,
  transformWithOxc,
  type DevEnvironment,
  type EnvironmentModuleGraph,
  type EnvironmentModuleNode,
  type Plugin,
  type ResolvedConfig,
  type UserConfig,
  type ViteDevServer,
} from 'vite';
import {findAngularLibraries, packagePathPattern, packagePattern} from './angular-libraries.js';
import {NgpCompiler, type HmrUpdate} from './compiler.js';
import {writeEntryTsconfig} from './entry-tsconfig.js';
import {link, LINKER_MARKER} from './linker.js';
import {isSideEffectFree, optimize, OPTIMIZER_CANDIDATE} from './optimizer.js';
import type {Engine} from './ngp-api.js';
import {
  buildReport,
  OVERLAY_CLIENT,
  OVERLAY_CLIENT_ID,
  OVERLAY_CLIENT_URL,
  startDevTypeCheck,
  TypeChecker,
  type TypeCheckResult,
} from './type-check.js';
import {rewriteToUrls, stylesPlugin, type StylesPluginContext} from './styles.js';

export interface NgpPluginOptions {
  /**
   * Directory holding an ngp build: `preprocessor/api.js` and `engines/`. Defaults to the
   * NGP_TOOLCHAIN environment variable.
   */
  toolchain?: string;
  /** Analyzer engine. Defaults to `native`, with no fallback to wasm. */
  engine?: Engine;
  /**
   * The app's tsconfig, relative to Vite's root. Defaults to tsconfig.app.json, else tsconfig.json.
   * Under Vitest, tsconfig.spec.json comes first.
   */
  tsconfig?: string;
  /**
   * Entry modules, relative to Vite's root. Defaults to `src/main.ts`, plus `src/main.server.ts`
   * when it exists. Under Vitest it defaults to none: the analyzer reads each spec, and what it
   * imports, when Vitest asks for it.
   */
  entries?: string[];
  /**
   * Give the analyzer a generated tsconfig that lists only `entries`, which keeps edits from
   * costing time proportional to project size. Defaults to true.
   */
  entryOnlyTsconfig?: boolean;
  /**
   * Component HMR in the dev server: edits to an external template, and `.ts` edits that only
   * change a component's inline `template` or `styles`, update the running component in place.
   * Defaults to true. Ignored in builds.
   */
  hmr?: boolean;
  /**
   * Server-side rendering. Ignored under Vitest. The entry module default-exports
   * `render(url: string, document: string): Promise<string>`, which turns index.html into the
   * rendered page. In dev, the plugin renders every page request through it. `vite build` then
   * builds the client into `dist/client` and the entry into `dist/server`. `true` means the entry
   * is `src/main.server.ts`. Off by default.
   */
  ssr?: boolean | {entry?: string};
  /**
   * Type-check templates and TypeScript: TypeScript 7 (`tsgo`) checks the app's sources together
   * with ngp's type-check blocks, in a child process, and errors in a block are reported at their
   * template location. In dev, errors show in the terminal and Vite's error overlay after each
   * edit, without holding up transforms or HMR. `vite build` fails on any error. Defaults to true,
   * except under Vitest.
   */
  typeCheck?: boolean;
}

type Consumer = 'client' | 'server';

/**
 * The slice of Vitest's `configureVitest` hook this plugin uses, typed by hand so the plugin
 * doesn't depend on Vitest.
 */
interface VitestPluginContext {
  vitest: {watcher: {onFileChange(file: string): void}};
  /** Called only when Vitest's fsModuleCache is on. `false` keeps a module out of the cache. */
  defineCacheKeyGenerator(generator: (context: {id: string}) => string | false | undefined): void;
}

const TS_MODULE = /\.[cm]?ts$/;
/** `DEBUG=vite-plugin-ngp` logs every module ngp compiles, with its time. */
const debug = /(?:^|,)vite-plugin-ngp(?:,|$)/.test(process.env['DEBUG'] ?? '');

/**
 * How far apart two file changes can be and still count as one edit. An editor saving all files,
 * a git checkout or a rename across files writes them within a few milliseconds.
 */
const EDIT_BATCH_MS = 50;

export function ngp(options: NgpPluginOptions = {}): Plugin[] {
  const compiler = compilerPlugin(options);
  return [compiler, stylesPlugin(compiler.api), linkerPlugin(), optimizerPlugin()];
}

function compilerPlugin(
  options: NgpPluginOptions,
): Plugin<StylesPluginContext> & {api: StylesPluginContext; configureVitest(context: VitestPluginContext): void} {
  let config: ResolvedConfig;
  let vitest: VitestPluginContext['vitest'] | null = null;
  /**
   * One compiler per consumer. Server environments get their own, compiled without HMR: HMR code
   * imports update modules from URLs that only a browser can load.
   */
  const compilers = new Map<Consumer, Promise<NgpCompiler>>();
  let hmr = false;
  let root = process.cwd();
  /** Under Vitest: specs are compiled like any other module, with no HMR and no SSR. */
  const testing = isVitest();
  const ssrOptions = testing ? null : options.ssr === true ? {} : options.ssr || null;
  const ssrEntry = ssrOptions ? (ssrOptions.entry ?? 'src/main.server.ts') : null;
  /**
   * Latest update module per component, served at `/@ng/component?c=<id>`. Keyed by the decoded
   * id (`src/app/home.ts@Home`), which is what the `c` query parameter decodes to.
   */
  const componentUpdates = new Map<string, string>();
  const typeCheck = options.typeCheck ?? !testing;
  let checker: TypeChecker | null = null;
  let devCheck: ReturnType<typeof startDevTypeCheck> | null = null;
  let typeCheckOverlay = false;
  let buildCheck: Promise<TypeCheckResult> | null = null;
  /**
   * Files whose last compile for the browser failed. Their components aren't running, so an edit
   * can't update them in place: the page has to reload.
   */
  const failed = new Set<string>();
  /** When each file last changed on disk, as the watcher reported it. */
  const changedAt = new Map<string, number>();
  /**
   * Whether each `.ts` file's latest change was applied in place. Created when the watcher reports
   * the change and settled by the browser's hotUpdate, so a template edited in the same save can
   * wait for the answer.
   */
  const tsEdits = new Map<string, {inPlace: Promise<boolean>; settle: (inPlace: boolean) => void}>();

  /** Whether the `.ts` change that came with a template change was applied in place. */
  function tsEditInPlace(tsFile: string): Promise<boolean> {
    const edit = tsEdits.get(tsFile);
    // A hotUpdate that never ran, or threw, counts as a reload.
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000).unref());
    return edit ? Promise.race([edit.inPlace, timeout]) : Promise.resolve(false);
  }

  /**
   * Whether `tsFile` changed in the same edit as `templateFile`, which changed just now. Waits for
   * the rest of the edit to arrive: Vite handles each file's change on its own, in any order.
   */
  async function changedTogether(templateFile: string, tsFile: string): Promise<boolean> {
    const templateTime = changedAt.get(templateFile) ?? Date.now();
    await new Promise((resolve) => setTimeout(resolve, EDIT_BATCH_MS));
    const tsTime = changedAt.get(tsFile);
    return tsTime !== undefined && Math.abs(tsTime - templateTime) <= EDIT_BATCH_MS;
  }

  /** One check over every file the tsconfig includes, plus any other the compiler has compiled. */
  async function runTypeCheck(): Promise<TypeCheckResult> {
    checker ??= new TypeChecker({
      tsconfig: resolveTsconfig(config.root, options.tsconfig, testing),
      outDir: path.join(config.cacheDir, 'vite-plugin-ngp/type-check'),
      cwd: config.root,
    });
    // The browser's compiler: type-check blocks don't depend on HMR, and it always exists.
    const ngp = await getCompiler('client');
    const files = new Set([...checker.programFiles(), ...ngp.knownFiles().filter((f) => TS_MODULE.test(f))]);
    return checker.check(await ngp.typeCheckBlocks(files));
  }

  function getCompiler(consumer: Consumer): Promise<NgpCompiler> {
    let compiler = compilers.get(consumer);
    compiler ??= (async () => {
      const toolchainDir = options.toolchain ?? process.env['NGP_TOOLCHAIN'];
      if (!toolchainDir) {
        throw new Error('vite-plugin-ngp: set the `toolchain` option or NGP_TOOLCHAIN to an ngp build.');
      }
      const tsconfig = resolveTsconfig(config.root, options.tsconfig, testing);
      const entries = (options.entries ?? (testing ? [] : ['src/main.ts', 'src/main.server.ts']))
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

  /**
   * Watch mode under Vitest. Vitest turns Vite's HMR off, so `hotUpdate` never runs, but the
   * analyzer still has to see each edit, and every module whose output it changes has to be
   * compiled again. Vitest reruns the specs that import an edited module. A template isn't a
   * module, so for a template edit the plugin tells Vitest its component changed.
   */
  async function onTestEdit(server: ViteDevServer, file: string) {
    if (!(TS_MODULE.test(file) || file.endsWith('.html')) || compilers.size === 0) {
      return;
    }
    // Read synchronously, so the update is queued before Vitest's debounced rerun transforms.
    const content = fs.readFileSync(file, 'utf8');
    let owner: string | null = null;
    for (const [consumer, compiler] of compilers) {
      const ngp = await compiler;
      const {stale} = await ngp.update(file, content, 'watcher');
      owner ??= file.endsWith('.html') ? await ngp.componentForTemplate(file) : null;
      for (const environment of Object.values(server.environments)) {
        if (environment.config.consumer !== consumer) {
          continue;
        }
        for (const f of new Set([...stale, ...(owner ? [owner] : [])])) {
          for (const mod of environment.moduleGraph.getModulesByFile(f) ?? []) {
            environment.moduleGraph.invalidateModule(mod);
          }
        }
      }
    }
    if (owner) {
      vitest?.watcher.onFileChange(owner);
    }
  }

  async function closeCompilers() {
    const current = [...compilers.values()];
    compilers.clear();
    for (const compiler of current) {
      (await compiler.catch(() => null))?.close();
    }
  }

  /** Stores update modules, invalidates `tsFile` without a reload, and tells the page. */
  async function sendUpdates(environment: DevEnvironment, tsFile: string, updates: HmrUpdate[], timestamp: number) {
    for (const update of updates) {
      // Update modules name external stylesheets by path too.
      const js = await transformWithOxc(rewriteToUrls(update.code).code, `${tsFile}.hmr.ts`, {lang: 'ts'});
      componentUpdates.set(decodeURIComponent(update.id), js.code);
    }
    // Invalidate without reloading, so the next full load compiles the new code.
    const graph = environment.moduleGraph;
    for (const mod of graph.getModulesByFile(tsFile) ?? []) {
      graph.invalidateModule(mod, new Set(), timestamp, true);
    }
    for (const update of updates) {
      environment.hot.send({type: 'custom', event: 'angular:component-update', data: {id: update.id, timestamp}});
      config.logger.info(`hmr update ${decodeURIComponent(update.id)}`, {timestamp: true});
    }
  }

  /**
   * Sends an edited template to the running component, or reloads the page when it can't. An
   * update module runs against the class already on the page. If the class changed in the same
   * edit, the new template may use members it doesn't have yet, so the class's own change
   * reloads the page instead. A `.ts` change that was itself applied in place left the class as
   * it was, so the template update still goes out.
   */
  async function updateTemplate(
    environment: DevEnvironment,
    ngp: NgpCompiler,
    file: string,
    owner: string,
    stale: string[],
    timestamp: number,
  ) {
    const graph = environment.moduleGraph;
    const invalidate = () => {
      for (const f of new Set([...stale, owner])) {
        for (const mod of graph.getModulesByFile(f) ?? []) {
          graph.invalidateModule(mod);
        }
      }
    };
    if ((await changedTogether(file, owner)) && !(await tsEditInPlace(owner))) {
      invalidate();
      return;
    }
    try {
      const updates = await ngp.hmrUpdates(owner, file);
      if (updates.length > 0) {
        await sendUpdates(environment, owner, updates, timestamp);
        return;
      }
    } catch (error) {
      config.logger.error(`[vite-plugin-ngp] HMR update for ${file} failed, reloading: ${String(error)}`);
    }
    invalidate();
    environment.hot.send({type: 'full-reload'});
  }

  /**
   * Applies a `.ts` edit in place if it only changed components' inline `template` or `styles`.
   * Resolves to false when the edit needs a page reload.
   */
  async function updateInline(
    environment: DevEnvironment,
    ngp: NgpCompiler,
    file: string,
    previous: string,
    content: string,
    timestamp: number,
  ): Promise<boolean> {
    try {
      const updates = await ngp.inlineHmrUpdates(file, previous, content);
      if (!updates) {
        return false;
      }
      // No updates: the edit changed only trivia that no component depends on.
      await sendUpdates(environment, file, updates, timestamp);
      return true;
    } catch (error) {
      // Vite drops errors thrown from hotUpdate silently. Say so, and reload instead.
      config.logger.error(`[vite-plugin-ngp] HMR update for ${file} failed, reloading: ${String(error)}`);
      return false;
    }
  }

  return {
    name: 'vite-plugin-ngp',
    api: {getCompiler, hmr: () => hmr},
    // Before Vite's own TypeScript transform: ngp returns TypeScript, and Vite strips the types.
    enforce: 'pre',

    // The same compile-time globals the Angular CLI defines, so Angular can drop dev-only and JIT
    // code. The linker makes every library AOT, so JIT is never needed.
    config(userConfig, env) {
      hmr = env.command === 'serve' && options.hmr !== false && !testing;
      root = path.resolve(userConfig.root ?? process.cwd());
      if (testing) {
        // Vitest leaves node_modules to Node, which would load Angular libraries unlinked, and
        // they'd need the JIT compiler. Inlining them sends them through the linker, and keeps
        // one copy of @angular/core. Tests use devDependencies too.
        const inline = [
          /[\\/]node_modules[\\/]@angular[\\/]/,
          ...findAngularLibraries(root, {devDependencies: true}).map(packagePathPattern),
        ];
        return {define: {ngJitMode: 'false', ngHmrMode: 'false'}, test: {server: {deps: {inline}}}} as UserConfig;
      }
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

    configureVitest(context) {
      vitest = context.vitest;
      // Vitest caches transformed modules on disk, keyed by the module's own content. A compiled
      // component also depends on its template, its styles, and the components it imports, so
      // the app's modules are compiled fresh on every run. Linked libraries are still cached.
      context.defineCacheKeyGenerator(({id}) => (isAppModule(id) ? false : undefined));
    },

    configureServer(server) {
      if (testing) {
        server.watcher.on('change', (file) => {
          onTestEdit(server, file).catch((error) => {
            config.logger.error(`[vite-plugin-ngp] ${file}: ${String(error)}`);
          });
        });
        return;
      }
      server.httpServer?.once('close', closeCompilers);
      if (typeCheck) {
        const viteHmr = server.config.server.hmr;
        typeCheckOverlay = viteHmr !== false && (typeof viteHmr !== 'object' || viteHmr.overlay !== false);
        devCheck = startDevTypeCheck({
          server,
          run: runTypeCheck,
          filesChanged: () => checker?.filesChanged(),
          abort: () => checker?.abort(),
          overlay: typeCheckOverlay,
        });
      }
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

    // Type errors fail the build. The check starts once every module is transformed, and runs
    // while Rolldown renders and minifies the chunks.
    buildEnd(error) {
      if (typeCheck && !error && config.command === 'build' && this.environment.config.consumer === 'client') {
        buildCheck = runTypeCheck();
        buildCheck.catch(() => {});
      }
    },

    async generateBundle() {
      if (!buildCheck) {
        return;
      }
      const report = buildReport(await buildCheck, config.root);
      buildCheck = null;
      if (report.error) {
        this.error(report.error);
      }
      config.logger.info(report.info);
    },

    // Also runs when the dev server closes: a check still writing to the cache would outlive it.
    // Vitest closes its Vite server through here, with no HTTP server to wait for.
    async closeBundle() {
      await devCheck?.close();
      if (config.command === 'build' || testing) {
        return closeCompilers();
      }
    },

    // The dev server's overlay client for type errors.
    resolveId: {
      filter: {id: /^\/@ngp\/type-check-client\.js$/},
      handler: () => OVERLAY_CLIENT_ID,
    },
    load: {
      filter: {id: /^\0vite-plugin-ngp:type-check-client$/},
      handler: () => OVERLAY_CLIENT,
    },
    transformIndexHtml() {
      if (typeCheckOverlay) {
        return [{tag: 'script', attrs: {type: 'module', src: OVERLAY_CLIENT_URL}, injectTo: 'head'}];
      }
    },

    transform: {
      filter: {id: {include: TS_MODULE, exclude: [/\.d\.[cm]?ts$/, /\/node_modules\//]}},
      async handler(code, id) {
        const file = cleanId(id);
        const ngp = await getCompiler(this.environment.config.consumer);
        if (this.environment.name === 'client') {
          failed.add(file);
        }
        const start = performance.now();
        const result = await ngp.transform(file, code);
        if (debug) {
          const ms = (performance.now() - start).toFixed(1);
          // To stderr, like Vite's own DEBUG output: Vitest silences Vite's logger.
          process.stderr.write(`vite-plugin-ngp ${result ? 'compiled' : 'unchanged'} ${path.relative(config.root, file)} (${ms} ms)\n`);
        }
        // Freshly compiled code already contains any pending template update.
        const prefix = decodeURIComponent(ngp.componentId(file, ''));
        for (const componentId of componentUpdates.keys()) {
          if (componentId.startsWith(prefix)) {
            componentUpdates.delete(componentId);
          }
        }
        if (!result) {
          failed.delete(file);
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
        failed.delete(file);
        return {code: result.code, map: result.map};
      },
    },

    // Vite calls this for every change before any hotUpdate, so hotUpdate sees the whole edit.
    watchChange(id) {
      changedAt.set(id, Date.now());
      if (TS_MODULE.test(id)) {
        tsEdits.get(id)?.settle(false);
        let settle!: (inPlace: boolean) => void;
        const inPlace = new Promise<boolean>((resolve) => (settle = resolve));
        tsEdits.set(id, {inPlace, settle});
      }
    },

    // Template edits, and .ts edits that only change inline templates or styles, update the
    // component in place. Every other edit returns the affected modules, and since compiled
    // components don't accept updates, Vite reloads the page.
    async hotUpdate({file, type, read, timestamp, modules}) {
      // Each environment updates its own compiler, so the server renders the edit too.
      const compiler = compilers.get(this.environment.config.consumer);
      if (!compiler || !(TS_MODULE.test(file) || file.endsWith('.html'))) {
        return;
      }
      const ngp = await compiler;
      const graph = this.environment.moduleGraph;
      if (this.environment.config.consumer === 'client') {
        devCheck?.schedule();
      }
      // The event type isn't reliable: macOS's watcher reports some new files as updates, and a
      // file can be gone by the time an update is handled. Whether it can be read decides.
      const content = type === 'delete' ? null : await Promise.resolve().then(read).catch(() => null);

      if (content === null) {
        tsEdits.get(file)?.settle(false);
        const stale = await ngp.remove(file);
        const prefix = decodeURIComponent(ngp.componentId(file, ''));
        for (const componentId of componentUpdates.keys()) {
          if (componentId.startsWith(prefix)) {
            componentUpdates.delete(componentId);
          }
        }
        // Every importer has to resolve its imports again, and fail now if it still imports the
        // file, whether or not the analyzer knew about the import.
        const importers = modulesOf(graph, [file]).flatMap((mod) => [...mod.importers]);
        return invalidateAll(graph, [...modulesOf(graph, stale), ...importers], modules);
      }

      const {stale, previous} = await ngp.update(file, content, 'watcher');
      const owner = file.endsWith('.html') ? await ngp.componentForTemplate(file) : null;

      if (owner && hmr && this.environment.name === 'client' && !failed.has(owner)) {
        // Decided in the background: Vite runs the other environments' hotUpdate only after this
        // one returns, and the server has to see the new template before the page reloads.
        void updateTemplate(this.environment, ngp, file, owner, stale, timestamp);
        // Returning [] would make Vite reload: it treats every changed .html file with no modules
        // as a page. A node for the template that Vite has never transformed stops update
        // propagation without a reload, which is what "handled" means here.
        const url = '/' + path.relative(config.root, file).split(path.sep).join('/');
        return [await graph.ensureEntryFromUrl(url, false)];
      }

      if (TS_MODULE.test(file) && hmr && this.environment.name === 'client') {
        const inPlace =
          previous !== undefined &&
          !failed.has(file) &&
          (await updateInline(this.environment, ngp, file, previous, content, timestamp));
        tsEdits.get(file)?.settle(inPlace);
        if (inPlace) {
          // For a .ts file, no modules means handled.
          return [];
        }
      }

      return invalidateAll(graph, modulesOf(graph, [...stale, ...(owner ? [owner] : [])]), modules);
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

/**
 * Angular's build optimizer, in `vite build` only: marks Angular's definitions and top-level code
 * pure, so Rolldown can drop what the app doesn't use. Runs after the linker for libraries, and
 * after Vite has stripped TypeScript for the app's own modules.
 */
function optimizerPlugin(): Plugin {
  return {
    name: 'vite-plugin-ngp:optimizer',
    apply: 'build',
    config() {
      // What the CLI passes to esbuild as `pure`.
      return {build: {rolldownOptions: {treeshake: {manualPureFunctions: ['forwardRef']}}}};
    },
    transform: {
      filter: {id: /\.[cm]?[jt]s$/, code: OPTIMIZER_CANDIDATE},
      handler(code, id) {
        return optimize(code, id, {sideEffectFree: isSideEffectFree(cleanId(id))}) as never;
      },
    },
  };
}

/**
 * Invalidates the stale modules, and returns them for Vite to propagate along with the modules
 * Vite picked itself. Vite's include, for a new file, every module whose import of it failed to
 * resolve before. With nothing stale, returns undefined and leaves Vite's choice alone.
 */
function invalidateAll(
  graph: EnvironmentModuleGraph,
  stale: EnvironmentModuleNode[],
  modules: EnvironmentModuleNode[],
): EnvironmentModuleNode[] | undefined {
  if (stale.length === 0) {
    return;
  }
  for (const mod of new Set(stale)) {
    graph.invalidateModule(mod);
  }
  return [...new Set([...stale, ...modules])];
}

function modulesOf(graph: EnvironmentModuleGraph, files: string[]): EnvironmentModuleNode[] {
  return files.flatMap((f) => [...(graph.getModulesByFile(f) ?? [])]);
}

function resolveTsconfig(root: string, configured: string | undefined, testing: boolean): string {
  const candidates = configured
    ? [configured]
    : [...(testing ? ['tsconfig.spec.json'] : []), 'tsconfig.app.json', 'tsconfig.json'];
  for (const candidate of candidates) {
    const file = path.resolve(root, candidate);
    if (fs.existsSync(file)) {
      return file;
    }
  }
  throw new Error(`vite-plugin-ngp: no tsconfig found in ${root} (tried ${candidates.join(', ')})`);
}

/** A module the compiler plugin transforms: the app's own TypeScript. */
function isAppModule(id: string): boolean {
  const file = cleanId(id);
  return TS_MODULE.test(file) && !/\.d\.[cm]?ts$/.test(file) && !/[\\/]node_modules[\\/]/.test(file);
}

/** Vitest sets VITEST in the process that runs Vite and in every worker. */
function isVitest(): boolean {
  return !!process.env['VITEST'];
}

function cleanId(id: string): string {
  return id.replace(/[?#].*$/, '');
}
