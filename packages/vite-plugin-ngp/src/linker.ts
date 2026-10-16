import type {PluginItem} from '@babel/core';
import {ConsoleLogger, LogLevel, NodeJSFileSystem} from '@angular/compiler-cli';

/**
 * Angular libraries ship partially compiled: `ɵɵngDeclareComponent(...)` and friends describe a
 * declaration without being its runtime code. The linker turns those calls into the final
 * `ɵɵdefineComponent(...)` code for the installed Angular version, as the CLI does for every
 * library in `node_modules`. ngp only compiles the app's own sources, so this is the plugin's job.
 */
export const LINKER_MARKER = 'ɵɵngDeclare';

/** Angular's compiler and core define the ɵɵngDeclare functions but never need linking. */
const NEVER_LINKED = /[\\/]@angular[\\/](?:compiler|core)[\\/]/;

let linkerPlugin: Promise<PluginItem> | null = null;

function getLinkerPlugin(): Promise<PluginItem> {
  linkerPlugin ??= import('@angular/compiler-cli/linker/babel').then(
    ({createEs2015LinkerPlugin}) =>
      // compiler-cli's PluginObject type comes from its own copy of @babel/core's types.
      createEs2015LinkerPlugin({
        linkerJitMode: false,
        sourceMapping: false,
        fileSystem: new NodeJSFileSystem(),
        logger: new ConsoleLogger(LogLevel.warn),
      }) as PluginItem,
  );
  return linkerPlugin;
}

/** Links one library module. Resolves to null when it has nothing to link. */
export async function link(code: string, id: string): Promise<{code: string; map: unknown} | null> {
  const file = id.replace(/[?#].*$/, '');
  if (!code.includes(LINKER_MARKER) || NEVER_LINKED.test(file)) {
    return null;
  }
  const babel = await import('@babel/core');
  const result = await babel.transformAsync(code, {
    filename: file,
    configFile: false,
    babelrc: false,
    compact: false,
    sourceMaps: true,
    plugins: [await getLinkerPlugin()],
  });
  return result?.code == null ? null : {code: result.code, map: result.map};
}
