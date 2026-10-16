import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import type {NodePath, PluginItem, PluginObject, types} from '@babel/core';
import type {ɵParsedTranslation} from '@angular/localize';
import MagicString from 'magic-string';
import type {Connect, Logger, Plugin, ResolvedConfig} from 'vite';

export interface I18nOptions {
  /**
   * The locale the app's source text is written in. Defaults to `en-US`. Built into its own folder,
   * like every other locale, with `$localize` metadata stripped and no translation applied.
   */
  sourceLocale?: string | {code: string; subPath?: string};
  /**
   * Translated locales: the locale code, and the translation file (or files) relative to Vite's
   * root. XLIFF 1.2 and 2.0, XMB/XTB, JSON and ARB are read, as with the Angular CLI. `subPath` is
   * the output folder and URL segment, and defaults to the locale code.
   */
  locales?: Record<string, string | string[] | {translation: string | string[]; subPath?: string}>;
  /** The locale the dev server serves. Defaults to the source locale. */
  devLocale?: string;
  /** What to do with a message the translation file lacks. Defaults to `warning`. */
  missingTranslation?: 'error' | 'warning' | 'ignore';
}

interface Locale {
  code: string;
  /** Output folder below each environment's outDir, and the URL segment the locale is served at. */
  subPath: string;
  /** Absolute paths of the translation files. None for the source locale. */
  files: string[];
}

type Translations = Record<string, ɵParsedTranslation>;

/**
 * Stands in for the locale in the build's `$localize` prelude until each locale's output replaces
 * it with the locale code and its locale data. Same name the Angular CLI uses.
 */
const LOCALE_PLACEHOLDER = '___NG_LOCALE_INSERT___';
const PRELUDE_ID = 'virtual:ngp-i18n';
const RESOLVED_PRELUDE_ID = '\0' + PRELUDE_ID;

/**
 * Set by `extractMessages`: build without translating, so the output keeps every `$localize`
 * message for @angular/localize's extractor to find.
 */
export const EXTRACT_ENV = 'NGP_I18N_EXTRACT';

/**
 * The plugin's view of the i18n options, exposed as `api` so the extractor can read the source
 * locale from a resolved Vite config.
 */
export interface I18nApi {
  sourceLocale: string;
}

/**
 * Angular i18n, the way the Angular CLI does it. ngp compiles `i18n` attributes into `$localize`
 * tagged templates, and this plugin decides what `$localize` means:
 *
 * - `vite` (dev): one locale, `devLocale`, translated at runtime. Each entry module first imports a
 *   prelude that loads `@angular/localize/init`, that locale's data and its translations.
 * - `vite build`: every locale, translated at build time. Rolldown renders one output per locale
 *   from the same module graph, into `<outDir>/<subPath>`, and this plugin's `renderChunk`
 *   replaces each `$localize` call with the translated string before the chunk is minified and
 *   hashed. No `$localize` runtime ships.
 */
export function i18nPlugin(options: I18nOptions, getEntries: (root: string) => string[]): Plugin {
  const source = typeof options.sourceLocale === 'object' ? options.sourceLocale : {code: options.sourceLocale ?? 'en-US'};
  let config: ResolvedConfig;
  let locales: Locale[] = [];
  let command: 'build' | 'serve' = 'serve';
  const extracting = () => process.env[EXTRACT_ENV] === '1';
  /** The URL the app is deployed under. Each locale lives at `<base><subPath>/`. */
  let deployBase = '/';
  /** Locale per output directory, so a render hook knows which locale it renders. */
  const localeByOutDir = new Map<string, Locale>();
  const translations = new Map<string, Promise<Translations>>();
  /** Each diagnostic once per locale, though every environment's output repeats it. */
  const reported = new Set<string>();

  function loadLocale(locale: Locale): Promise<Translations> {
    let loaded = translations.get(locale.code);
    loaded ??= loadTranslationFiles(locale, config.logger);
    translations.set(locale.code, loaded);
    return loaded;
  }

  const api: I18nApi = {sourceLocale: source.code};

  return {
    name: 'vite-plugin-ngp:i18n',
    api,

    config(userConfig, env) {
      command = env.command;
      deployBase = userConfig.base ?? '/';
      const root = path.resolve(userConfig.root ?? process.cwd());
      locales = [
        {code: source.code, subPath: source.subPath ?? source.code, files: []},
        ...Object.entries(options.locales ?? {}).map(([code, value]) => {
          const spec = typeof value === 'string' || Array.isArray(value) ? {translation: value} : value;
          const files = (Array.isArray(spec.translation) ? spec.translation : [spec.translation]).map((f) => path.resolve(root, f));
          return {code, subPath: spec.subPath ?? code, files};
        }),
      ];
      if (env.command === 'serve') {
        const devLocale = devLocaleOf(options, locales);
        const deps = ['@angular/localize/init', '@angular/localize'];
        const data = localeDataModule(devLocale.code, root);
        if (data) {
          deps.push(data.id);
        }
        // The prelude isn't in any source file, so Vite's dependency scan can't see what it imports.
        return {optimizeDeps: {include: deps}};
      }
      if (extracting()) {
        return;
      }
      // Every locale's files sit one folder down, at `<base><subPath>/`. Relative URLs, resolved
      // against each page's <base href>, let one build serve all of them.
      return {base: './'};
    },

    configResolved(resolved) {
      config = resolved;
      if (command !== 'build' || extracting()) {
        return;
      }
      // One output per locale for every environment: the browser bundle and the server entry.
      for (const environment of Object.values(resolved.environments)) {
        const rolldownOptions = environment.build.rolldownOptions;
        if (Array.isArray(rolldownOptions.output)) {
          throw new Error('vite-plugin-ngp: i18n builds one output per locale, so `build.rolldownOptions.output` must not be an array.');
        }
        const output = rolldownOptions.output ?? {};
        const outDir = path.resolve(resolved.root, environment.build.outDir);
        rolldownOptions.output = locales.map((locale) => {
          const dir = path.join(outDir, locale.subPath);
          localeByOutDir.set(dir, locale);
          return {...output, dir};
        });
      }
    },

    resolveId: {
      filter: {id: new RegExp(`^${PRELUDE_ID}$`)},
      handler: () => RESOLVED_PRELUDE_ID,
    },

    load: {
      filter: {id: new RegExp(`^\0${PRELUDE_ID}$`)},
      async handler() {
        if (command === 'build') {
          // Each locale's renderChunk swaps the placeholder for the locale and its locale data.
          // The global has to exist before Angular reads `$localize.locale`.
          return `(globalThis.$localize ??= {}).locale = ${JSON.stringify(LOCALE_PLACEHOLDER)};\n`;
        }
        const locale = devLocaleOf(options, locales);
        for (const file of locale.files) {
          this.addWatchFile(file);
        }
        const messages: Record<string, string> = {};
        for (const [id, translation] of Object.entries(await loadLocale(locale))) {
          messages[id] = targetMessage(translation);
        }
        const data = localeDataModule(locale.code, config.root);
        return [
          `import '@angular/localize/init';`,
          `import {loadTranslations} from '@angular/localize';`,
          data ? `import ${JSON.stringify(data.id)};` : '',
          locale.files.length ? `loadTranslations(${JSON.stringify(messages)});` : '',
          `$localize.locale = ${JSON.stringify(locale.code)};`,
        ].join('\n');
      },
    },

    // Entry modules import the prelude first, so `$localize` is set up before any other module
    // runs. In dev that's the runtime and the translations; in builds just the locale.
    transform: {
      filter: {id: /\.[cm]?ts$/},
      handler(code, id) {
        if (extracting() || !getEntries(config.root).includes(id.replace(/[?#].*$/, ''))) {
          return null;
        }
        const s = new MagicString(code);
        s.prepend(`import ${JSON.stringify(PRELUDE_ID)};\n`);
        return {code: s.toString(), map: s.generateMap({hires: 'boundary'})};
      },
    },

    // Editing a translation file reloads the page with the new text.
    hotUpdate({file}) {
      const locale = devLocaleOf(options, locales);
      if (this.environment.name !== 'client' || !locale.files.includes(file)) {
        return;
      }
      translations.delete(locale.code);
      const prelude = this.environment.moduleGraph.getModuleById(RESOLVED_PRELUDE_ID);
      if (prelude) {
        this.environment.moduleGraph.invalidateModule(prelude);
      }
      this.environment.hot.send({type: 'full-reload'});
      return [];
    },

    async renderChunk(code, chunk, outputOptions) {
      const locale = outputOptions.dir ? localeByOutDir.get(path.resolve(outputOptions.dir)) : undefined;
      if (!locale || !(code.includes('$localize') || code.includes(LOCALE_PLACEHOLDER))) {
        return null;
      }
      const result = await translateChunk(code, chunk.fileName, locale, {
        translations: await loadLocale(locale),
        // The source locale has no translations: every message is "missing", on purpose.
        missingTranslation: locale.files.length ? (options.missingTranslation ?? 'warning') : 'ignore',
        localeData: readLocaleData(locale.code, config.root, config.logger),
      });
      for (const {type, message} of result.diagnostics) {
        const key = `${locale.code}\0${message}`;
        if (reported.has(key)) {
          continue;
        }
        reported.add(key);
        if (type === 'error') {
          this.error(`[${locale.code}] ${message}`);
        }
        this.warn(`[${locale.code}] ${message}`);
      }
      return {code: result.code, map: result.map as never};
    },

    // Each locale's index.html gets its language, and a <base href> that both the relative asset
    // URLs and Angular's router resolve against. `post`, because Vite emits index.html in its own
    // generateBundle.
    generateBundle: {
      order: 'post',
      handler(outputOptions, bundle) {
        const locale = outputOptions.dir ? localeByOutDir.get(path.resolve(outputOptions.dir)) : undefined;
        if (!locale) {
          return;
        }
        for (const file of Object.values(bundle)) {
          if (file.type === 'asset' && file.fileName.endsWith('.html')) {
            file.source = localizeHtml(String(file.source), locale.code, joinBase(deployBase, locale.subPath));
          }
        }
      },
    },

    // `vite preview` serves the outDir as it is, and its SPA fallback is the root index.html, which
    // a localized build doesn't have. Send each locale's pages to its own index.html, and `/` to the
    // locale the browser prefers.
    configurePreviewServer(server) {
      const outDir = path.resolve(config.root, config.environments['client']?.build.outDir ?? config.build.outDir);
      server.middlewares.use(previewMiddleware(locales, source.code, outDir));
    },
  };
}

function devLocaleOf(options: I18nOptions, locales: Locale[]): Locale {
  const code = options.devLocale ?? locales[0]!.code;
  const locale = locales.find((l) => l.code === code);
  if (!locale) {
    throw new Error(`vite-plugin-ngp: devLocale '${code}' is neither the source locale nor in i18n.locales.`);
  }
  return locale;
}

/** A translation as the runtime's `loadTranslations` takes it: text with `{$name}` placeholders. */
function targetMessage(translation: ɵParsedTranslation): string {
  let text = translation.messageParts[0]!;
  for (let i = 1; i < translation.messageParts.length; i++) {
    text += `{$${translation.placeholderNames[i - 1]}}${translation.messageParts[i]}`;
  }
  return text;
}

/**
 * Reads a locale's translation files with @angular/localize's parsers, trying each format the CLI
 * accepts. Later files win over earlier ones for the same message id.
 */
async function loadTranslationFiles(locale: Locale, logger: Logger): Promise<Translations> {
  if (locale.files.length === 0) {
    return {};
  }
  const tools = await import('@angular/localize/tools');
  const parsers = [
    new tools.Xliff2TranslationParser(),
    new tools.Xliff1TranslationParser(),
    new tools.XtbTranslationParser(),
    new tools.SimpleJsonTranslationParser(),
    new tools.ArbTranslationParser(),
  ];
  const translations: Translations = {};
  for (const file of locale.files) {
    const contents = await fs.promises.readFile(file, 'utf8');
    let parsed: ReturnType<(typeof parsers)[number]['parse']> | undefined;
    for (const parser of parsers) {
      const analysis = parser.analyze(file, contents);
      if (analysis.canParse) {
        parsed = parser.parse(file, contents, analysis.hint as never);
        break;
      }
    }
    if (!parsed) {
      throw new Error(`vite-plugin-ngp: ${file} is not a translation file in a format @angular/localize reads.`);
    }
    if (parsed.diagnostics.hasErrors) {
      throw new Error(parsed.diagnostics.formatDiagnostics(`vite-plugin-ngp: failed to read ${file}`));
    }
    if (parsed.locale && parsed.locale !== locale.code) {
      logger.warn(`[vite-plugin-ngp] ${path.basename(file)} is for locale '${parsed.locale}', but is configured for '${locale.code}'.`);
    }
    Object.assign(translations, parsed.translations);
  }
  return translations;
}

/**
 * Angular's global locale data for a locale, which registers it for the pipes and plural rules.
 * Falls back from `de-CH` to `de` like the CLI. `en` and `en-US` are built into @angular/core.
 */
function localeDataModule(code: string, root: string): {id: string; file: string} | null {
  const require = createRequire(path.join(root, 'package.json'));
  let tag = new Intl.Locale(code).baseName;
  while (tag && tag !== 'en' && tag !== 'en-US') {
    const id = `@angular/common/locales/global/${tag}`;
    try {
      return {id, file: require.resolve(id)};
    } catch {
      tag = tag.split('-').slice(0, -1).join('-');
    }
  }
  return null;
}

function readLocaleData(code: string, root: string, logger: Logger): string {
  const data = localeDataModule(code, root);
  if (!data) {
    if (!/^en(-US)?$/.test(new Intl.Locale(code).baseName)) {
      logger.warn(`[vite-plugin-ngp] No Angular locale data for '${code}'. Pipes will format in en-US.`);
    }
    return '';
  }
  return fs.readFileSync(data.file, 'utf8');
}

let babelPlugins: Promise<typeof import('@angular/localize/tools')> | null = null;

/**
 * Translates one rendered chunk for one locale with @angular/localize's Babel plugins, the ones the
 * CLI's inliner was built on: every `$localize` call becomes its translated string, every read of
 * `$localize.locale` becomes the locale code, and the prelude's placeholder becomes the locale code
 * followed by the locale's data.
 */
export async function translateChunk(
  code: string,
  fileName: string,
  locale: {code: string},
  options: {translations: Translations; missingTranslation: 'error' | 'warning' | 'ignore'; localeData: string},
): Promise<{code: string; map: unknown; diagnostics: {type: 'error' | 'warning'; message: string}[]}> {
  babelPlugins ??= import('@angular/localize/tools');
  const tools = await babelPlugins;
  const babel = await import('@babel/core');
  const diagnostics = new tools.Diagnostics();
  const localeDataStatements = options.localeData
    ? (babel.parseSync(options.localeData, {configFile: false, babelrc: false, sourceType: 'script'})?.program.body ?? [])
    : [];
  const placeholderPlugin: PluginObject = {
    visitor: {
      StringLiteral(literal: NodePath<types.StringLiteral>) {
        if (literal.node.value !== LOCALE_PLACEHOLDER) {
          return;
        }
        literal.replaceWith(babel.types.stringLiteral(locale.code));
        if (localeDataStatements.length > 0) {
          literal.getStatementParent()?.insertAfter(localeDataStatements.map((s) => babel.types.cloneNode(s)));
        }
      },
    },
  };
  const result = await babel.transformAsync(code, {
    filename: fileName,
    configFile: false,
    babelrc: false,
    compact: false,
    sourceMaps: true,
    plugins: [
      // @angular/localize's PluginObject type comes from its own view of @babel/core's types.
      tools.makeEs2015TranslatePlugin(diagnostics, options.translations, {missingTranslation: options.missingTranslation}) as PluginItem,
      tools.makeLocalePlugin(locale.code) as PluginItem,
      placeholderPlugin as PluginItem,
    ],
  });
  return {code: result?.code ?? code, map: result?.map ?? null, diagnostics: diagnostics.messages};
}

/** Sets `<html lang>` and `<base href>`, adding the base element when the page has none. */
export function localizeHtml(html: string, lang: string, baseHref: string): string {
  let out = /<html\b[^>]*\blang=/i.test(html)
    ? html.replace(/(<html\b[^>]*\blang=)("[^"]*"|'[^']*'|[^\s>]+)/i, `$1"${lang}"`)
    : html.replace(/<html\b/i, `<html lang="${lang}"`);
  out = /<base\b[^>]*>/i.test(out)
    ? out.replace(/<base\b[^>]*>/i, `<base href="${baseHref}">`)
    : out.replace(/<head\b[^>]*>/i, (head) => `${head}\n    <base href="${baseHref}">`);
  return out;
}

function joinBase(base: string, subPath: string): string {
  const prefix = base.endsWith('/') ? base : base + '/';
  return subPath ? `${prefix}${subPath}/` : prefix;
}

/**
 * Page requests under `/<subPath>/` that match no file get that locale's index.html. `/` redirects
 * to the first locale the browser accepts, else the source locale.
 */
export function previewMiddleware(locales: Locale[], sourceLocale: string, outDir: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    const accept = req.headers.accept ?? '';
    if ((req.method !== 'GET' && req.method !== 'HEAD') || !accept.includes('text/html')) {
      return next();
    }
    const url = new URL(req.url ?? '/', 'http://localhost');
    const [first] = url.pathname.split('/').filter(Boolean);
    const locale = locales.find((l) => l.subPath === first);
    if (!locale) {
      if (url.pathname !== '/') {
        return next();
      }
      const preferred = negotiateLocale(req.headers['accept-language'] ?? '', locales) ?? locales.find((l) => l.code === sourceLocale)!;
      res.statusCode = 302;
      res.setHeader('Location', `/${preferred.subPath}/`);
      return res.end();
    }
    const file = path.join(outDir, decodeURIComponent(url.pathname));
    if (!file.startsWith(outDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      req.url = `/${locale.subPath}/index.html`;
    }
    next();
  };
}

/** The first locale in an Accept-Language header that matches a built locale or its language. */
export function negotiateLocale<T extends {code: string}>(header: string, locales: T[]): T | undefined {
  const wanted = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
      return {tag: tag!.toLowerCase(), q: q ? Number(q.slice(2)) : 1};
    })
    .filter((w) => w.tag && w.q > 0)
    .sort((a, b) => b.q - a.q);
  for (const {tag} of wanted) {
    const match =
      locales.find((l) => l.code.toLowerCase() === tag) ??
      locales.find((l) => l.code.toLowerCase().split('-')[0] === tag.split('-')[0]);
    if (match) {
      return match;
    }
  }
  return undefined;
}
