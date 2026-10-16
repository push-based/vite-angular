import * as fs from 'node:fs';
import * as path from 'node:path';
import type {EnvironmentModuleNode, Plugin, ResolvedConfig} from 'vite';
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
}

const TS_MODULE = /\.[cm]?ts$/;

export function ngp(options: NgpPluginOptions = {}): Plugin[] {
  return [compilerPlugin(options), linkerPlugin()];
}

function compilerPlugin(options: NgpPluginOptions): Plugin {
  let config: ResolvedConfig;
  let compiler: Promise<NgpCompiler> | null = null;

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
      return NgpCompiler.create({toolchainDir, engine: options.engine ?? 'native', tsconfig, analyzerTsconfig});
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

    configResolved(resolved) {
      config = resolved;
    },

    configureServer(server) {
      server.httpServer?.once('close', closeCompiler);
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
        const result = await (await getCompiler()).transform(file, code);
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

    // No component HMR yet: returning the affected modules lets Vite propagate the update, and
    // since compiled components don't accept it, the page reloads.
    async hotUpdate({file, type, read}) {
      if (!compiler || type === 'delete' || !(TS_MODULE.test(file) || file.endsWith('.html'))) {
        return;
      }
      const ngp = await compiler;
      const stale = await ngp.update(file, await read(), 'watcher');
      const owner = file.endsWith('.html') ? await ngp.componentForTemplate(file) : null;
      const affected = new Set<EnvironmentModuleNode>();
      for (const f of new Set([...stale, ...(owner ? [owner] : [])])) {
        for (const mod of this.environment.moduleGraph.getModulesByFile(f) ?? []) {
          this.environment.moduleGraph.invalidateModule(mod);
          affected.add(mod);
        }
      }
      if (affected.size === 0) {
        return;
      }
      for (const mod of this.environment.moduleGraph.getModulesByFile(file) ?? []) {
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
