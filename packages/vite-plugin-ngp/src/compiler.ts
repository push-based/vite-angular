import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {readConfiguration} from '@angular/compiler-cli';
import {loadNgp, type Analyzer, type Engine, type HybridCompiler, type NgpDiagnostic} from './ngp-api.js';

export interface CompilerOptions {
  toolchainDir: string;
  engine: Engine;
  /** The user's tsconfig: compiler options and rootDir come from here. */
  tsconfig: string;
  /** The tsconfig the analyzer reads. See writeEntryTsconfig for why it can differ. */
  analyzerTsconfig: string;
  /** Emit component HMR code, as the CLI's dev server does. */
  enableHmr: boolean;
}

/** One component's HMR update: Angular's id for it, and the update module as TypeScript. */
export interface HmrUpdate {
  id: string;
  code: string;
}

export interface TransformResult {
  code: string;
  map: string;
  diagnostics: NgpDiagnostic[];
}

/**
 * One long-lived ngp compiler, driven the way Vite drives a plugin: per module, from the code
 * Vite hands over, in optimize mode, without ever running the whole-program delta pass.
 */
export class NgpCompiler {
  /** What the analyzer believes each file contains, so edits are sent to it exactly once. */
  private readonly known = new Map<string, string>();
  /** Analyzer updates run one at a time, in call order. */
  private updates: Promise<unknown> = Promise.resolve();

  private constructor(
    private readonly analyzer: Analyzer,
    private readonly hybrid: HybridCompiler,
    private readonly rootDir: string,
  ) {}

  static async create(options: CompilerOptions): Promise<NgpCompiler> {
    const {api, binding} = await loadNgp(options.toolchainDir, options.engine);
    const ngOptions = readConfiguration(options.tsconfig).options;
    const analyzer = await api.createAnalyzer(options.analyzerTsconfig, {
      optimize: true,
      enableHmr: options.enableHmr,
      backend: options.engine,
      ...binding,
    });
    const rootDir = path.dirname(options.tsconfig);
    // No tsconfigPath: with one, ngp rewrites .ngdiag.json after every chunk.
    const hybrid = new api.HybridCompiler(analyzer, {
      optimize: true,
      tcbConfig: api.buildTypeCheckingConfig(ngOptions, false),
      rootDir,
      supportJitMode: ngOptions['supportJitMode'] !== false,
      enableHmr: options.enableHmr,
    });
    return new NgpCompiler(analyzer, hybrid, rootDir);
  }

  /** Compiles one module. Resolves to null when ngp leaves it unchanged. */
  async transform(file: string, code: string): Promise<TransformResult | null> {
    await this.update(file, code, 'transform');
    const processed = await this.hybrid.processFile(file, code);
    if (!processed.magicString.hasChanged()) {
      return null;
    }
    return {
      code: processed.magicString.toString(),
      map: processed.magicString.generateMap({hires: 'boundary', source: file, includeContent: true}).toString(),
      diagnostics: processed.diagnostics ?? [],
    };
  }

  /**
   * Sends a file's content to the analyzer if it differs from what the analyzer has, and resolves
   * to the TypeScript files whose output may have changed. Works for templates too.
   *
   * This skips HybridCompiler.updateFileContent on purpose: that runs analyzeOptimizedDelta, which
   * re-streams every file in the program after each edit. Vite re-requests what the page still
   * uses, so dropping the stale files from the cache is enough.
   */
  update(file: string, content: string, origin: 'transform' | 'watcher'): Promise<string[]> {
    const run = this.updates.then(async () => {
      // A file we haven't seen yet: from a transform, the analyzer has read (or will read) the
      // same disk content, so compare against disk. From the watcher, disk already holds the edit,
      // so the only safe answer is that it changed.
      const previous =
        this.known.get(file) ??
        (origin === 'transform' ? await fs.readFile(file, 'utf8').catch(() => undefined) : undefined);
      this.known.set(file, content);
      if (previous === content) {
        return [];
      }
      const invalidated = await this.analyzer.updateFileContent([{filePath: file, content}]);
      const stale = invalidated.filter((f) => f.endsWith('.ts')).map((f) => path.resolve(f));
      for (const f of [...stale, file]) {
        this.hybrid.fileCache.delete(f);
      }
      return stale;
    });
    this.updates = run.catch(() => {});
    return run;
  }

  /** The component file for an external template, or null if no component uses it. */
  async componentForTemplate(templateFile: string): Promise<string | null> {
    const result = await this.analyzer.getTsFileForTemplate(templateFile);
    return result?.[0] ? path.resolve(result[0].tsFilePath) : null;
  }

  /**
   * Update modules for the components in `tsFile` that use `templateFile` as their external
   * template. Resolves to an empty list when no component in the file uses it.
   */
  async hmrUpdates(tsFile: string, templateFile: string): Promise<HmrUpdate[]> {
    await this.updates;
    const metadata = await this.analyzer.getMetadataForFile(tsFile);
    const updates: HmrUpdate[] = [];
    for (const cls of metadata?.classes ?? []) {
      const template = cls.component?.templateUrl?.resolvedPath;
      if (!cls.className || !template || path.resolve(template) !== templateFile) {
        continue;
      }
      const code = await this.hybrid.emitHmrUpdateModule(tsFile, cls.className);
      if (code) {
        updates.push({id: this.componentId(tsFile, cls.className), code});
      }
    }
    return updates;
  }

  /**
   * Angular's HMR id for a component: `encodeURIComponent('<path from rootDir>@<ClassName>')`,
   * the same id the compiled component's HMR initializer listens for.
   */
  componentId(tsFile: string, className: string): string {
    const relative = path.relative(this.rootDir, tsFile).split(path.sep).join('/');
    return encodeURIComponent(`${relative}@${className}`);
  }

  close(): void {
    this.analyzer.close();
  }
}
