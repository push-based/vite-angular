import * as fs from 'node:fs';
import * as path from 'node:path';
import type {ɵParsedMessage} from '@angular/localize';
import {EXTRACT_ENV, type I18nApi} from './i18n.js';

export type ExtractFormat = 'xlf' | 'xlf2' | 'xmb' | 'json' | 'arb';

export interface ExtractOptions {
  /** The Vite project root. Defaults to the current directory. */
  root?: string;
  /** Vite config file. Defaults to Vite's own lookup in `root`. */
  configFile?: string;
  /** Translation file format. Defaults to `xlf` (XLIFF 1.2), the Angular CLI's default. */
  format?: ExtractFormat;
  /** Output file, relative to `root`. Defaults to `src/locale/messages.<format extension>`. */
  outFile?: string;
  /** Two messages with the same id and different text. Defaults to `warning`. */
  duplicates?: 'error' | 'warning' | 'ignore';
}

const EXTENSIONS: Record<ExtractFormat, string> = {xlf: 'xlf', xlf2: 'xlf', xmb: 'xmb', json: 'json', arb: 'arb'};

/**
 * The plugin's `ng extract-i18n`. Builds the browser bundle in memory, unminified, with source maps
 * and without translating, then runs @angular/localize's MessageExtractor over every chunk and
 * writes the messages in one of its formats. Same approach as the Angular CLI: extract from what
 * the compiler emitted, so the ids match what the build will look up.
 */
export async function extractMessages(options: ExtractOptions = {}): Promise<{outFile: string; messages: number}> {
  const root = path.resolve(options.root ?? process.cwd());
  const format = options.format ?? 'xlf';
  if (!(format in EXTENSIONS)) {
    throw new Error(`vite-plugin-ngp: unknown format '${format}'. Use one of ${Object.keys(EXTENSIONS).join(', ')}.`);
  }
  const outFile = path.resolve(root, options.outFile ?? `src/locale/messages.${EXTENSIONS[format]}`);
  const tools = await import('@angular/localize/tools');
  const {createBuilder} = await import('vite');

  const previous = process.env[EXTRACT_ENV];
  process.env[EXTRACT_ENV] = '1';
  let chunks: {file: string; code: string; map: string | null}[];
  let sourceLocale = 'en-US';
  try {
    const builder = await createBuilder(
      {
        root,
        configFile: options.configFile,
        logLevel: 'warn',
        build: {write: false, minify: false, sourcemap: true},
      },
      null,
    );
    const api = builder.config.plugins.find((p) => p.name === 'vite-plugin-ngp:i18n')?.api as I18nApi | undefined;
    sourceLocale = api?.sourceLocale ?? sourceLocale;
    const client = builder.environments['client']!;
    const outDir = path.resolve(root, client.config.build.outDir);
    const result = await builder.build(client);
    const outputs = (Array.isArray(result) ? result : [result]) as {output: {type: string; fileName: string; code?: string; map?: {toString(): string} | null}[]}[];
    chunks = outputs
      .flatMap((o) => o.output)
      .filter((o) => o.type === 'chunk')
      .map((o) => ({file: path.join(outDir, o.fileName), code: o.code!, map: o.map?.toString() ?? null}));
  } finally {
    if (previous === undefined) {
      delete process.env[EXTRACT_ENV];
    } else {
      process.env[EXTRACT_ENV] = previous;
    }
  }

  // The extractor reads files through this, so the in-memory chunks and their maps look like files
  // in the outDir. Original sources, which the maps point to, come from disk.
  const memory = new Map<string, string>();
  for (const chunk of chunks) {
    const mapFile = `${chunk.file}.map`;
    memory.set(chunk.file, chunk.map ? `${chunk.code}\n//# sourceMappingURL=${path.basename(mapFile)}\n` : chunk.code);
    if (chunk.map) {
      memory.set(mapFile, chunk.map);
    }
  }
  const fileSystem = {
    readFile: (p: string) => memory.get(p) ?? fs.readFileSync(p, 'utf8'),
    exists: (p: string) => memory.has(p) || fs.existsSync(p),
    relative: (from: string, to: string) => path.relative(from, to),
    resolve: (...paths: string[]) => path.resolve(...paths),
    dirname: (p: string) => path.dirname(p),
  };
  const logger = {
    level: 2,
    debug: () => {},
    info: () => {},
    warn: (...args: string[]) => console.warn(args.join('')),
    error: (...args: string[]) => console.error(args.join('')),
  };
  const extractor = new tools.MessageExtractor(fileSystem as never, logger, {basePath: root as never, useSourceMaps: true});
  const messages: ɵParsedMessage[] = [];
  for (const chunk of chunks) {
    if (chunk.code.includes('$localize')) {
      messages.push(...extractor.extractMessages(chunk.file));
    }
  }

  const duplicates = options.duplicates ?? 'warning';
  const diagnostics = tools.checkDuplicateMessages(fileSystem as never, messages, duplicates, root as never);
  if (diagnostics.hasErrors) {
    throw new Error(diagnostics.formatDiagnostics('vite-plugin-ngp: message extraction failed'));
  }
  if (diagnostics.messages.length > 0) {
    console.warn(diagnostics.formatDiagnostics(''));
  }

  const serializer = createSerializer(tools, format, sourceLocale, root, fileSystem);
  await fs.promises.mkdir(path.dirname(outFile), {recursive: true});
  await fs.promises.writeFile(outFile, serializer.serialize(messages));
  return {outFile, messages: messages.length};
}

function createSerializer(
  tools: typeof import('@angular/localize/tools'),
  format: ExtractFormat,
  sourceLocale: string,
  root: string,
  fileSystem: object,
): {serialize(messages: ɵParsedMessage[]): string} {
  // Legacy message ids aren't written, as with the CLI's application builder.
  const basePath = root as never;
  switch (format) {
    case 'xlf':
      return new tools.Xliff1TranslationSerializer(sourceLocale, basePath, false, {});
    case 'xlf2':
      return new tools.Xliff2TranslationSerializer(sourceLocale, basePath, false, {});
    case 'xmb':
      return new tools.XmbTranslationSerializer(basePath, false);
    case 'json':
      return new tools.SimpleJsonTranslationSerializer(sourceLocale);
    case 'arb':
      return new tools.ArbTranslationSerializer(sourceLocale, basePath, fileSystem as never);
  }
}
