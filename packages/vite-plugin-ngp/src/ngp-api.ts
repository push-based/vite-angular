// The slice of ngp's API this plugin uses, typed by hand. ngp isn't published, so there's no
// package to take types from; these match `toolchain/out/preprocessor/api.js` at Angular 92e5aa8.

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {pathToFileURL} from 'node:url';

export type Engine = 'native' | 'wasm';

export interface MagicStringLike {
  toString(): string;
  hasChanged(): boolean;
  generateMap(options: {hires?: boolean | 'boundary'; source?: string; includeContent?: boolean}): {
    toString(): string;
  };
}

export interface NgpDiagnostic {
  filePath?: string;
  category: number;
  code: number;
  messageText: string;
  span?: {start: number; end: number};
}

export interface ProcessedFile {
  magicString: MagicStringLike;
  diagnostics?: NgpDiagnostic[];
}

export interface ClassMetadata {
  className?: string;
  component?: {templateUrl?: {url: string; resolvedPath: string}};
}

export interface Analyzer {
  getMetadataForFile(filePath: string): Promise<{filePath: string; classes: ClassMetadata[]} | null>;
  /** Tells the analyzer a file changed. Resolves to every file whose analysis is now stale. */
  updateFileContent(updates: {filePath: string; content: string}[]): Promise<string[]>;
  getTsFileForTemplate(templatePath: string): Promise<{tsFilePath: string}[] | null>;
  close(): void;
}

export interface HybridCompiler {
  readonly analyzer: Analyzer;
  /** Per-file analysis cache, keyed by the analyzer's file path. */
  readonly fileCache: Map<string, unknown>;
  processFile(filePath: string, content: string): Promise<ProcessedFile>;
  /** The update module for one component, as TypeScript, or null if HMR is off. */
  emitHmrUpdateModule(filePath: string, className: string): Promise<string | null>;
}

export interface HybridCompilerOptions {
  optimize: boolean;
  tcbConfig: unknown;
  rootDir: string;
  supportJitMode: boolean;
  enableHmr: boolean;
}

export interface NgpApi {
  createAnalyzer(
    tsconfigPath: string,
    options: {optimize: boolean; enableHmr: boolean; backend: Engine; nativeBinding?: string; wasmBinding?: string},
  ): Promise<Analyzer>;
  HybridCompiler: new (analyzer: Analyzer, options: HybridCompilerOptions) => HybridCompiler;
  buildTypeCheckingConfig(ngOptions: unknown, strictTemplates: boolean): unknown;
}

/**
 * Loads ngp from a toolchain directory as `pnpm toolchain` lays it out in `toolchain/out`:
 * `preprocessor/api.js` and `engines/{native,wasm}/`.
 */
export async function loadNgp(toolchainDir: string, engine: Engine) {
  const apiPath = path.join(toolchainDir, 'preprocessor/api.js');
  const binding =
    engine === 'native'
      ? {nativeBinding: path.join(toolchainDir, 'engines/native/ng_analyze.node')}
      : {wasmBinding: path.join(toolchainDir, 'engines/wasm/ng_analyze.js')};
  for (const file of [apiPath, ...Object.values(binding)]) {
    await fs.access(file).catch(() => {
      throw new Error(
        `vite-plugin-ngp: ${file} not found. Build ngp with \`pnpm toolchain\` in the ` +
          `vite-angular repo root, then point the plugin's \`toolchain\` option or ` +
          `NGP_TOOLCHAIN at its toolchain/out directory.`,
      );
    });
  }
  const api = (await import(pathToFileURL(apiPath).href)) as NgpApi;
  return {api, binding};
}
