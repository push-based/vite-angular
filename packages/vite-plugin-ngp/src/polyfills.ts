import * as fs from 'node:fs';
import * as path from 'node:path';
import MagicString from 'magic-string';
import type {Plugin} from 'vite';

/**
 * Whether the app runs on zone.js, decided the way @angular/build's `isZonelessApp` decides it:
 * `zone.js` in the polyfills, or any polyfill that's a file, since a file might import zone.js.
 */
export function usesZone(polyfills: string[]): boolean {
  return polyfills.some((p) => p === 'zone.js' || /\.[mc]?[jt]s$/.test(p));
}

/**
 * The imports to put in front of each entry module, for one kind of environment. Browsers get every
 * polyfill. Servers get only what the CLI gives its server bundle: `zone.js/node` in place of
 * `zone.js`, and `@angular/localize/init`.
 */
export function polyfillImports(polyfills: string[], root: string, consumer: 'client' | 'server'): string[] {
  const specifiers =
    consumer === 'client'
      ? polyfills
      : polyfills.flatMap((p) => (p === 'zone.js' ? ['zone.js/node'] : p.startsWith('@angular/localize') ? ['@angular/localize/init'] : []));
  return specifiers.map((p) => {
    // A path to a file in the project, like the CLI's `src/polyfills.ts`.
    const file = path.resolve(root, p);
    return path.extname(p) && fs.existsSync(file) ? file.split(path.sep).join('/') : p;
  });
}

/**
 * Imports the polyfills at the top of each entry module, so they run before anything the entry
 * imports, @angular/core included. The CLI builds them into a separate bundle that index.html loads
 * first. Here they're the entry's first imports, which runs them first in dev, in the build and on
 * the server alike.
 */
export function polyfillsPlugin(polyfills: string[], entries: () => string[]): Plugin {
  let root = process.cwd();
  return {
    name: 'vite-plugin-ngp:polyfills',
    enforce: 'pre',
    configResolved(config) {
      root = config.root;
    },
    transform: {
      filter: {id: /\.[cm]?[jt]s(?:$|\?)/},
      handler(code, id) {
        if (!entries().includes(id.replace(/[?#].*$/, ''))) {
          return null;
        }
        const imports = polyfillImports(polyfills, root, this.environment.config.consumer);
        if (imports.length === 0) {
          return null;
        }
        const s = new MagicString(code);
        s.prepend(imports.map((i) => `import ${JSON.stringify(i)};\n`).join(''));
        return {code: s.toString(), map: s.generateMap({hires: 'boundary', source: id, includeContent: true})};
      },
    },
  };
}

/**
 * Rewrites async functions into generators for zone.js apps. zone.js patches `Promise`, but
 * `await` on a native async function bypasses it, so Angular never learns that the code after an
 * `await` ran: no change detection in the browser, and a server render that finishes before the
 * data arrives. The CLI turns off esbuild's `async-await` support for zone apps. This does the
 * same with esbuild, and only that: Rolldown's own lowering can only target a whole ES version,
 * which would also rewrite optional chaining, spread and class fields.
 *
 * Builds lower each output chunk once. The dev server lowers each module as it's served, the
 * pre-bundled dependencies included.
 */
export function zoneAsyncPlugin(): Plugin {
  const lower = async (code: string, file: string, sourcemap: boolean) => {
    const esbuild = await import('esbuild');
    const result = await esbuild.transform(code, {
      loader: 'js',
      sourcefile: file,
      sourcemap: sourcemap ? 'external' : false,
      // Same as @angular/build's getFeatureSupport(false). The second line works around an esbuild
      // minifier bug with downleveled for-await at es2019+ targets.
      supported: {'async-await': false, 'optional-catch-binding': false},
    });
    return {code: result.code, map: sourcemap ? result.map : null};
  };
  let build = false;
  return {
    name: 'vite-plugin-ngp:zone-async',
    enforce: 'post',
    configResolved(config) {
      build = config.command === 'build';
    },
    transform: {
      filter: {id: {exclude: [/^\0/, /^\/@vite\//, /\.(css|html|json|wasm)(?:$|\?)/]}, code: /\basync\b/},
      handler(code, id) {
        return build ? null : lower(code, id, true);
      },
    },
    renderChunk: {
      filter: {code: /\basync\b/},
      handler(code, chunk) {
        return lower(code, chunk.fileName, !!this.environment.config.build.sourcemap);
      },
    },
  };
}
