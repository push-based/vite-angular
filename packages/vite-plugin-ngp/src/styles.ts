import {createHash} from 'node:crypto';
import * as path from 'node:path';
import {encapsulateStyle} from '@angular/compiler';
import MagicString from 'magic-string';
import type {EnvironmentModuleNode, Plugin, ResolvedConfig} from 'vite';
import type {NgpCompiler} from './compiler.js';

// Component stylesheets (`styleUrl`, `styleUrls`, `<link rel="stylesheet">` in a template) go
// through Vite's CSS pipeline, so preprocessors, PostCSS and `url()` rewriting all apply.
//
// ngp compiles with `externalRuntimeStyles`, which leaves stylesheets out of the component and
// emits `ɵɵExternalStylesFeature(['/absolute/path.scss'])` instead. What happens next depends on
// the command:
//
// - Dev server: the paths become flat names Vite serves (`card.ngp-1a2b3c4d.css`). Angular's
//   runtime adds a <link> per stylesheet and appends `?ngcomp=<encapsulation id>&e=<encapsulation>`,
//   the Angular CLI's protocol. This plugin scopes the compiled CSS to that id, and a style edit
//   reloads the <link> in place.
// - Build, and Vitest: each stylesheet is imported as a CSS string (`?inline`), scoped with a
//   placeholder for emulated encapsulation, and prepended to the component's `styles`. The bundle
//   has no extra requests, like ngp's own output without externalRuntimeStyles.

/** The file extensions Vite's CSS pipeline handles. Matches Vite's own CSS_LANGS_RE. */
const CSS_LANGS = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)(?:$|\?)/;
const TS_MODULE = /\.[cm]?ts$/;
/** `i0.ɵɵExternalStylesFeature(['/a.scss', '/b.css'])`, with ngp's or oxc's quoting. */
const FEATURE_CALL = /(?:[\w$]+\.)?ɵɵExternalStylesFeature\(\s*\[([^\]]*)\]\s*\)/g;
const STRING_LITERAL = /(['"])((?:\\.|(?!\1)[^\\])*)\1/g;
const DEFINE_COMPONENT = /ɵɵdefineComponent\(\s*\{\s*type:\s*([\w$]+)/g;
/** The ids Angular's runtime puts in `ngcomp`: `<app id>-c<hash>`. Same check as the CLI's. */
const COMPONENT_ID = /^[_.\-\p{Letter}\d]+-c\d+$/u;
/** Set on build imports of emulated-encapsulation stylesheets. */
const SCOPED_QUERY = 'ngp-scoped';
/**
 * Stands in for the component id in build output. Angular's own placeholder, `%COMP%`, isn't valid
 * CSS, and Vite's minifier rejects it, so the feature swaps this one for it at runtime.
 */
const ID_PLACEHOLDER = '__ngpcomp__';
/** A dev stylesheet name, `<basename>.ngp-<hash>.<ext>`, as the last segment of a request path. */
const STYLESHEET_NAME = /\/([^/?]+\.ngp-[0-9a-f]{8}\.\w+)(\?.*)?$/;
/**
 * Imported by every component module with external stylesheets in the dev server's browser
 * environment. Reloads component <link>s on a style edit.
 */
const CLIENT_ID = '/@ng/styles-hmr';
const RESOLVED_CLIENT_ID = '\0ngp:styles-hmr';
const STYLE_UPDATE_EVENT = 'angular:stylesheet-update';
const VIEW_ENCAPSULATION_EMULATED = 0;

export interface StylesPluginContext {
  getCompiler(consumer: 'client' | 'server'): Promise<NgpCompiler>;
  /** Whether component HMR is on, which also turns on style HMR. */
  hmr(): boolean;
  /**
   * Whether stylesheets are served as <link>s: in the dev server, but not under Vitest, where
   * nothing would load them. Otherwise they're inlined, as in builds.
   */
  linkStyles(): boolean;
}

export function stylesPlugin(context: StylesPluginContext): Plugin {
  let config: ResolvedConfig;

  return {
    name: 'vite-plugin-ngp:styles',

    configResolved(resolved) {
      config = resolved;
    },

    resolveId: {
      // Before Vite's resolver, which would look for the name in the root directory.
      order: 'pre',
      handler(id) {
        if (id === CLIENT_ID) {
          return RESOLVED_CLIENT_ID;
        }
        const match = STYLESHEET_NAME.exec(id);
        const file = match && stylesheetFiles.get(match[1]!);
        return file ? file + (match[2] ?? '') : undefined;
      },
    },

    load(id) {
      return id === RESOLVED_CLIENT_ID ? CLIENT_CODE : undefined;
    },

    // A normal-order plugin, so this runs after Vite's oxc transform for components and after
    // `vite:css` for stylesheets, which has compiled SCSS and run PostCSS by then. `vite:css-post`
    // hasn't wrapped the CSS in JavaScript yet, so this sees plain CSS.
    transform: {
      filter: {id: {include: [TS_MODULE, CSS_LANGS], exclude: /\/node_modules\//}},
      async handler(code, id) {
        const [file, query = ''] = id.split('?', 2) as [string, string?];
        if (CSS_LANGS.test(file)) {
          const css = scopeStylesheet(code, new URLSearchParams(query));
          return css === null ? null : {code: css, map: null};
        }
        if (!code.includes('ɵɵExternalStylesFeature')) {
          return null;
        }
        if (context.linkStyles()) {
          const listen = context.hmr() && this.environment.config.consumer === 'client';
          return rewriteToUrls(code, stylesheetName, listen ? CLIENT_ID : undefined);
        }
        const ngp = await context.getCompiler(this.environment.config.consumer);
        return inlineStylesheets(code, await ngp.encapsulations(file));
      },
    },

    // An edit to a component stylesheet, or to a partial it imports, reloads its <link>s instead of
    // the page. Vite's own `css-update` can't do this: its client drops the query, `ngcomp`
    // included, and updates only the first matching <link>.
    hotUpdate({type, modules, timestamp}) {
      // A deleted stylesheet is left to Vite, which reloads, so the page shows what's missing.
      if (!context.hmr() || type === 'delete' || this.environment.name !== 'client' || modules.length === 0) {
        return;
      }
      const stylesheets = new Set<EnvironmentModuleNode>();
      const seen = new Set<EnvironmentModuleNode>();
      const visit = (mod: EnvironmentModuleNode) => {
        if (seen.has(mod)) {
          return;
        }
        seen.add(mod);
        if (isComponentStylesheet(mod)) {
          stylesheets.add(mod);
        }
        mod.importers.forEach(visit);
      };
      modules.forEach(visit);
      if (stylesheets.size === 0) {
        return;
      }
      const names = new Set<string>();
      for (const mod of stylesheets) {
        this.environment.moduleGraph.invalidateModule(mod, new Set(), timestamp, true);
        names.add(mod.url.split('?')[0]!.split('/').pop()!);
      }
      this.environment.hot.send({type: 'custom', event: STYLE_UPDATE_EVENT, data: {names: [...names], timestamp}});
      config.logger.info(`hmr update ${[...names].join(', ')}`, {timestamp: true});
      // Everything else, a global stylesheet importing the same partial for one, Vite handles.
      return modules.filter((mod) => !onlyReachesComponentStylesheets(mod));
    },
  };
}

/** Every dev stylesheet name handed out, and the file it stands for. */
const stylesheetFiles = new Map<string, string>();

/**
 * The name a stylesheet is served under in dev: `<basename>.ngp-<hash of its path>.<ext>`, with no
 * directory. Angular adopts server-rendered <link>s by the part of their URL after the last slash,
 * so a URL with directories in it is never matched, and every link is added a second time. The
 * Angular CLI uses flat names for the same reason. The browser resolves the name against the page,
 * so a request can arrive under any directory, and `resolveId` maps it back by name alone.
 */
export function stylesheetName(file: string): string {
  const ext = path.extname(file);
  const hash = createHash('sha256').update(file).digest('hex').slice(0, 8);
  const name = `${path.basename(file, ext)}.ngp-${hash}${ext}`;
  stylesheetFiles.set(name, file);
  return name;
}

/**
 * Scopes a compiled stylesheet for its component, or returns null to leave it alone. Dev
 * requests carry the runtime's `ngcomp` id, which is empty for `None` and `ShadowDom`. Build
 * imports of emulated stylesheets carry `ngp-scoped`, and get a placeholder id.
 */
export function scopeStylesheet(css: string, params: URLSearchParams): string | null {
  if (params.has(SCOPED_QUERY)) {
    return encapsulateStyle(css, ID_PLACEHOLDER);
  }
  const componentId = params.get('ngcomp');
  if (!componentId) {
    return null;
  }
  if (!COMPONENT_ID.test(componentId)) {
    throw new Error(`vite-plugin-ngp: invalid component stylesheet id ${JSON.stringify(componentId)}`);
  }
  return encapsulateStyle(css, componentId);
}

/**
 * Dev: replaces the absolute paths in every ɵɵExternalStylesFeature call with served names, and
 * imports `client` if given.
 */
export function rewriteToUrls(code: string, urlFor: (file: string) => string = stylesheetName, client?: string) {
  const s = new MagicString(code);
  if (client) {
    s.prepend(`import ${JSON.stringify(client)};\n`);
  }
  for (const call of findFeatureCalls(code)) {
    for (const literal of call.paths) {
      s.overwrite(literal.start, literal.end, JSON.stringify(urlFor(literal.value)));
    }
  }
  return {code: s.toString(), map: s.generateMap({hires: 'boundary'})};
}

/**
 * Build: replaces every ɵɵExternalStylesFeature call with a feature that prepends the imported
 * stylesheets to the component's styles, with `%COMP%` back in place of the placeholder. Angular's
 * renderer then fills in the component id, as it does for ngp's inline styles. Features run inside
 * ɵɵdefineComponent, before anything reads `styles`, and `styles` isn't part of the component id,
 * so server and browser ids match.
 */
export function inlineStylesheets(code: string, encapsulations: Map<string, number>) {
  const s = new MagicString(code);
  const imports: string[] = [];
  for (const call of findFeatureCalls(code)) {
    const encapsulation = (call.className ? encapsulations.get(call.className) : undefined) ?? VIEW_ENCAPSULATION_EMULATED;
    const query = encapsulation === VIEW_ENCAPSULATION_EMULATED ? `?${SCOPED_QUERY}&inline` : '?inline';
    const scoped = encapsulation === VIEW_ENCAPSULATION_EMULATED;
    const names = call.paths.map((literal) => {
      const name = `__ngp_style_${imports.length}`;
      imports.push(`import ${name} from ${JSON.stringify(literal.value + query)};\n`);
      return scoped ? `${name}.replaceAll(${JSON.stringify(ID_PLACEHOLDER)}, '%COMP%')` : name;
    });
    s.overwrite(call.start, call.end, `((d) => { d.styles = [${names.join(', ')}, ...d.styles]; })`);
  }
  s.prepend(imports.join(''));
  return {code: s.toString(), map: s.generateMap({hires: 'boundary'})};
}

interface FeatureCall {
  start: number;
  end: number;
  /** The class whose ɵɵdefineComponent call this is in. */
  className: string | null;
  paths: {start: number; end: number; value: string}[];
}

function findFeatureCalls(code: string): FeatureCall[] {
  const components: {index: number; name: string}[] = [];
  for (const match of code.matchAll(DEFINE_COMPONENT)) {
    components.push({index: match.index, name: match[1]!});
  }
  const calls: FeatureCall[] = [];
  for (const match of code.matchAll(FEATURE_CALL)) {
    const listStart = match.index + match[0].indexOf('[') + 1;
    const paths = [...match[1]!.matchAll(STRING_LITERAL)].map((literal) => ({
      start: listStart + literal.index,
      end: listStart + literal.index + literal[0].length,
      value: literal[2]!.replace(/\\(.)/g, '$1'),
    }));
    const owner = components.findLast((c) => c.index < match.index);
    calls.push({start: match.index, end: match.index + match[0].length, className: owner?.name ?? null, paths});
  }
  return calls;
}

function isComponentStylesheet(mod: EnvironmentModuleNode): boolean {
  const query = mod.url.split('?')[1];
  return query !== undefined && new URLSearchParams(query).has('ngcomp');
}

/** True for a component stylesheet, and for a module that only component stylesheets import. */
function onlyReachesComponentStylesheets(mod: EnvironmentModuleNode, seen = new Set<EnvironmentModuleNode>()): boolean {
  if (isComponentStylesheet(mod)) {
    return true;
  }
  if (seen.has(mod) || mod.importers.size === 0) {
    return false;
  }
  seen.add(mod);
  return [...mod.importers].every((importer) => onlyReachesComponentStylesheets(importer, seen));
}

/**
 * Updates every <link> to an edited stylesheet in place, shadow roots included, keeping its query
 * and so its `ngcomp` id. Changing `href` on the same element, rather than swapping in a new one,
 * keeps Angular's SharedStylesHost pointing at the element it will remove later.
 */
const CLIENT_CODE = `
if (import.meta.hot) {
  import.meta.hot.on(${JSON.stringify(STYLE_UPDATE_EVENT)}, ({names, timestamp}) => {
    const roots = [document];
    for (const el of document.querySelectorAll('*')) {
      if (el.shadowRoot) roots.push(el.shadowRoot);
    }
    for (const root of roots) {
      for (const link of root.querySelectorAll('link[rel="stylesheet"]')) {
        const url = new URL(link.href);
        if (names.includes(url.pathname.split('/').pop())) {
          url.searchParams.set('t', String(timestamp));
          link.href = url.href;
        }
      }
    }
  });
}
`;
