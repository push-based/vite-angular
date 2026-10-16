import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {readConfiguration} from '@angular/compiler-cli';
import {hmrCandidates} from './hmr-candidates.js';
import {FileUpdateType, loadNgp, type Analyzer, type Engine, type HybridCompiler, type NgpDiagnostic} from './ngp-api.js';

export interface CompilerOptions {
  toolchainDir: string;
  engine: Engine;
  /** The user's tsconfig: compiler options and rootDir come from here. */
  tsconfig: string;
  /** The tsconfig the analyzer reads. See writeEntryTsconfig for why it can differ. */
  analyzerTsconfig: string;
  /** Emit component HMR code, as the CLI's dev server does. */
  enableHmr: boolean;
  /**
   * File replacements, from replaced file to replacement, as absolute paths. The analyzer reads
   * each replacement's content as the replaced file's, before it compiles anything.
   */
  fileReplacements?: Map<string, string>;
}

/** One component's HMR update: Angular's id for it, and the update module as TypeScript. */
export interface HmrUpdate {
  id: string;
  code: string;
}

/** What an edit did: the files whose output may have changed, and the content it replaced. */
export interface FileUpdate {
  stale: string[];
  /** The content the analyzer had before, or undefined if it never saw the file. */
  previous: string | undefined;
}

/** A component stylesheet: a `styleUrl` file, or an inline style and its size. */
export type ComponentStyle = {label: string; file: string} | {label: string; size: number};

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
  /** Type-check blocks as last generated, null for files without one. Stale files are dropped. */
  private readonly tcbs = new Map<string, string | null>();

  private constructor(
    private readonly analyzer: Analyzer,
    private readonly hybrid: HybridCompiler,
    /**
     * Generates type-check blocks only. It shares the analyzer but parses templates with
     * whitespace preserved, as ngtsc's type-check parse (`diagNodes`) does. With whitespace
     * collapsed, every span after a collapsed run points too early: `<h1>\n  {{ titel }}` puts
     * the error 2 columns before `titel`. ngp marks this TODO(parity) in parseComponentTemplate.
     */
    private readonly typeCheckHybrid: HybridCompiler,
    private readonly rootDir: string,
    private readonly replaced: ReadonlySet<string>,
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
    const hybridOptions = {
      optimize: true,
      tcbConfig: api.buildTypeCheckingConfig(ngOptions, false),
      rootDir,
      supportJitMode: ngOptions['supportJitMode'] !== false,
      enableHmr: options.enableHmr,
      // Stylesheets go through Vite's CSS pipeline instead: see styles.ts.
      externalRuntimeStyles: true,
      // The i18n options ngc reads from angularCompilerOptions. They change the message ids in the
      // `$localize` calls ngp emits, so they have to match what the translation files were made with.
      enableI18nLegacyMessageIdFormat: ngOptions['enableI18nLegacyMessageIdFormat'] as boolean | undefined,
      i18nNormalizeLineEndingsInICUs: ngOptions['i18nNormalizeLineEndingsInICUs'] as boolean | undefined,
      i18nUseExternalIds: ngOptions['i18nUseExternalIds'] as boolean | undefined,
    };
    const hybrid = new api.HybridCompiler(analyzer, hybridOptions);
    const typeCheckHybrid = new api.HybridCompiler(analyzer, {...hybridOptions, enableHmr: false, preserveWhitespaces: true});
    const replacements = options.fileReplacements ?? new Map<string, string>();
    const compiler = new NgpCompiler(analyzer, hybrid, typeCheckHybrid, rootDir, new Set(replacements.keys()));
    // The analyzer follows imports on disk, so it would read the replaced file. Giving it the
    // replacement's content under the replaced file's path makes every file that imports it, and
    // every decorator that reads a value from it, compile against the replacement.
    for (const [file, replacement] of replacements) {
      await compiler.update(file, await fs.readFile(replacement, 'utf8'), 'watcher');
    }
    return compiler;
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
      diagnostics: [...(processed.diagnostics ?? []), ...(await this.missingTemplates(file))],
    };
  }

  /**
   * ngp compiles a component whose `templateUrl` file doesn't exist into an empty template, with
   * no diagnostic, even in a fresh compiler. ngc fails with NG2008, so report it the same way.
   */
  private async missingTemplates(file: string): Promise<NgpDiagnostic[]> {
    const metadata = await this.analyzer.getMetadataForFile(file);
    const missing: NgpDiagnostic[] = [];
    for (const cls of metadata?.classes ?? []) {
      const templateUrl = cls.component?.templateUrl;
      if (templateUrl && !(await fs.access(templateUrl.resolvedPath).then(() => true, () => false))) {
        missing.push({
          filePath: file,
          category: 1, // ts.DiagnosticCategory.Error
          code: 2008,
          messageText: `Could not find template file '${templateUrl.url}'.`,
          span: templateUrl.stringLiteralSpan,
        });
      }
    }
    return missing;
  }

  /**
   * Sends a file's content to the analyzer if it differs from what the analyzer has, and resolves
   * to the TypeScript files whose output may have changed, and to the content it replaced. Works
   * for templates too.
   *
   * This skips HybridCompiler.updateFileContent on purpose: that runs analyzeOptimizedDelta, which
   * re-streams every file in the program after each edit. Vite re-requests what the page still
   * uses, so dropping the stale files from the cache is enough.
   */
  update(file: string, content: string, origin: 'transform' | 'watcher'): Promise<FileUpdate> {
    return this.enqueue(async () => {
      // A replaced file's content comes from its replacement on disk: once at startup, then from
      // the watcher. A transform's code can be older than the last watcher edit, when Vite loaded
      // the module just before it, and sending it would undo that edit.
      if (origin === 'transform' && this.replaced.has(file)) {
        return {stale: [], previous: this.known.get(file)};
      }
      // A file we haven't seen yet: from a transform, the analyzer has read (or will read) the
      // same disk content, so compare against disk. From the watcher, disk already holds the edit,
      // so the only safe answer is that it changed.
      const previous =
        this.known.get(file) ??
        (origin === 'transform' ? await fs.readFile(file, 'utf8').catch(() => undefined) : undefined);
      this.known.set(file, content);
      if (previous === content) {
        return {stale: [], previous};
      }
      return {stale: this.dropStale(file, await this.analyzer.updateFileContent([{filePath: file, content}])), previous};
    });
  }

  /**
   * Tells the analyzer a file was deleted, and resolves to the TypeScript files whose output may
   * have changed: for a `.ts` file its importers, for a template the component that uses it.
   *
   * update() can't say this. The analyzer keeps every file it's sent in an in-memory overlay
   * that's never dropped, so it would go on compiling against the deleted content.
   * invalidateFiles drops the overlay, and the analyzer then finds the file gone from disk.
   */
  remove(file: string): Promise<string[]> {
    return this.enqueue(async () => {
      this.known.delete(file);
      const invalidated = await this.analyzer.invalidateFiles([{filePath: file, updateType: FileUpdateType.Deleted}]);
      return this.dropStale(file, invalidated);
    });
  }

  /** Runs analyzer updates one at a time, in call order. */
  private enqueue<T>(update: () => Promise<T>): Promise<T> {
    const run = this.updates.then(update);
    this.updates = run.catch(() => {});
    return run;
  }

  /** Drops the analyzer's stale files from ngp's cache, and returns the TypeScript ones. */
  private dropStale(file: string, invalidated: string[]): string[] {
    const stale = invalidated.filter((f) => f.endsWith('.ts')).map((f) => path.resolve(f));
    for (const f of [...stale, file]) {
      this.hybrid.fileCache.delete(f);
      this.typeCheckHybrid.fileCache.delete(f);
      this.tcbs.delete(f);
    }
    return stale;
  }

  /**
   * The type-check block of each file that has one, generated only for files that changed since
   * the last call. ngp generates blocks synchronously, so this yields to the event loop between
   * files to keep transforms flowing.
   */
  async typeCheckBlocks(files: Iterable<string>): Promise<Map<string, string>> {
    await this.updates;
    const blocks = new Map<string, string>();
    for (const file of files) {
      let tcb = this.tcbs.get(file);
      if (tcb === undefined) {
        await new Promise((resolve) => setImmediate(resolve));
        tcb = this.typeCheckHybrid.getTcbForFile(file);
        this.tcbs.set(file, tcb);
      }
      if (tcb) {
        blocks.set(file, tcb);
      }
    }
    return blocks;
  }

  /** Every file the analyzer has been sent, by a transform or an edit. */
  knownFiles(): string[] {
    return [...this.known.keys()];
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
    const classes = (metadata?.classes ?? []).filter((cls) => {
      const template = cls.component?.templateUrl?.resolvedPath;
      return template && path.resolve(template) === templateFile;
    });
    return (await this.emitUpdates(tsFile, classes.map((cls) => cls.className))) ?? [];
  }

  /**
   * Update modules for an edit to a component's `.ts` file that only changed inline `template` or
   * `styles` values: one per component whose values changed, and none when no component's did.
   * Resolves to null when the edit changed anything else, which needs a page reload. `previous`
   * is the file's content before the edit, as `update` returned it.
   */
  async inlineHmrUpdates(tsFile: string, previous: string, current: string): Promise<HmrUpdate[] | null> {
    await this.updates;
    const metadata = await this.analyzer.getMetadataForFile(tsFile);
    const components = new Set((metadata?.classes ?? []).filter((cls) => cls.component).map((cls) => cls.className));
    const changed = hmrCandidates(tsFile, previous, current, (name) => components.has(name));
    return changed && this.emitUpdates(tsFile, changed);
  }

  /** Resolves to null if ngp has no update module for one of the classes. */
  private async emitUpdates(tsFile: string, classNames: (string | undefined)[]): Promise<HmrUpdate[] | null> {
    const updates: HmrUpdate[] = [];
    for (const className of classNames) {
      const code = className && (await this.hybrid.emitHmrUpdateModule(tsFile, className));
      if (!code) {
        return null;
      }
      updates.push({id: this.componentId(tsFile, className), code});
    }
    return updates;
  }

  /** Each component's ViewEncapsulation in `tsFile`, by class name. */
  async encapsulations(tsFile: string): Promise<Map<string, number>> {
    await this.updates;
    const metadata = await this.analyzer.getMetadataForFile(tsFile);
    const result = new Map<string, number>();
    for (const cls of metadata?.classes ?? []) {
      if (cls.className && cls.component) {
        result.set(cls.className, cls.component.encapsulation ?? 0);
      }
    }
    return result;
  }

  /**
   * Each component stylesheet in `tsFile`: one per `styleUrl` file, with its path, and one per
   * inline style, with its size in bytes as written. ngp compiles inline styles itself, so they
   * reach the bundle as written. `styleUrl` files go through Vite's CSS pipeline.
   */
  async componentStyles(tsFile: string): Promise<ComponentStyle[]> {
    await this.updates;
    const metadata = await this.analyzer.getMetadataForFile(tsFile);
    const styles: ComponentStyle[] = [];
    for (const cls of metadata?.classes ?? []) {
      for (const url of cls.component?.styleUrls ?? []) {
        styles.push({label: this.relative(url.resolvedPath), file: path.resolve(url.resolvedPath)});
      }
      cls.component?.styles?.forEach((css, i) => {
        styles.push({label: `${this.relative(tsFile)} (${cls.className} inline style ${i + 1})`, size: Buffer.byteLength(css)});
      });
    }
    return styles;
  }

  private relative(file: string): string {
    return path.relative(this.rootDir, file).split(path.sep).join('/');
  }

  /**
   * Angular's HMR id for a component: `encodeURIComponent('<path from rootDir>@<ClassName>')`,
   * the same id the compiled component's HMR initializer listens for.
   */
  componentId(tsFile: string, className: string): string {
    return encodeURIComponent(`${this.relative(tsFile)}@${className}`);
  }

  close(): void {
    this.analyzer.close();
  }
}
