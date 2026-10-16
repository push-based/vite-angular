// Size budgets, checked after `vite build` the way `ng build` checks them. The thresholds, the
// size parsing and the messages follow @angular/build's src/utils/bundle-calculator.ts, so a
// `budgets` array copied from angular.json behaves the same and reads the same.

import * as path from 'node:path';
import type {Plugin, Rolldown} from 'vite';

type OutputBundle = Rolldown.OutputBundle;
type OutputChunk = Rolldown.OutputChunk;

/** One entry of angular.json's `budgets`, with the same fields. */
export interface Budget {
  type: 'initial' | 'all' | 'allScript' | 'any' | 'anyScript' | 'anyComponentStyle' | 'bundle';
  /** For `bundle`: the chunk's name. */
  name?: string;
  /** The size `%` limits are relative to, and that the others are added to. */
  baseline?: string;
  maximumWarning?: string;
  maximumError?: string;
  minimumWarning?: string;
  minimumError?: string;
  /** A warning above or below baseline by this much. */
  warning?: string;
  /** An error above or below baseline by this much. */
  error?: string;
}

export interface BudgetFailure {
  severity: 'warning' | 'error';
  label: string;
  message: string;
}

/** What a build produced, in the shape the calculators need. */
export interface BudgetStats {
  /** Every .js and .css file, with its names and whether the page loads it up front. */
  files: {name: string; size: number; initial: boolean; names: string[]}[];
  /** Every component stylesheet, labeled by its file (or by its component, for inline styles). */
  componentStyles: {label: string; size: number}[];
}

interface Threshold {
  limit: number;
  type: 'maximum' | 'minimum';
  severity: 'warning' | 'error';
}

const KB = 1000;

function* thresholds(budget: Budget): Generator<Threshold> {
  if (budget.maximumWarning) {
    yield {limit: bytes(budget.maximumWarning, budget.baseline, 1), type: 'maximum', severity: 'warning'};
  }
  if (budget.maximumError) {
    yield {limit: bytes(budget.maximumError, budget.baseline, 1), type: 'maximum', severity: 'error'};
  }
  if (budget.minimumWarning) {
    yield {limit: bytes(budget.minimumWarning, budget.baseline, -1), type: 'minimum', severity: 'warning'};
  }
  if (budget.minimumError) {
    yield {limit: bytes(budget.minimumError, budget.baseline, -1), type: 'minimum', severity: 'error'};
  }
  if (budget.warning) {
    yield {limit: bytes(budget.warning, budget.baseline, -1), type: 'minimum', severity: 'warning'};
    yield {limit: bytes(budget.warning, budget.baseline, 1), type: 'maximum', severity: 'warning'};
  }
  if (budget.error) {
    yield {limit: bytes(budget.error, budget.baseline, -1), type: 'minimum', severity: 'error'};
    yield {limit: bytes(budget.error, budget.baseline, 1), type: 'maximum', severity: 'error'};
  }
}

/** `'500kB'`, `'1mb'`, `'10%'` (of baseline) or a plain number of bytes. NaN if unreadable. */
export function bytes(input: string, baseline?: string, factor = 1): number {
  const matches = input.trim().match(/^(\d+(?:\.\d+)?)[ \t]*(%|[kmg]?b)?$/i);
  if (!matches) {
    return NaN;
  }
  const baselineBytes = (baseline && bytes(baseline)) || 0;
  let value = Number(matches[1]);
  switch (matches[2]?.toLowerCase()) {
    case '%':
      value = (baselineBytes * value) / 100;
      break;
    case 'kb':
      value *= KB;
      break;
    case 'mb':
      value *= KB * KB;
      break;
    case 'gb':
      value *= KB * KB * KB;
      break;
  }
  return baselineBytes === 0 ? value : baselineBytes + value * factor;
}

/** The CLI's size format: `512.34 kB`, in powers of 1000. */
export function formatSize(size: number): string {
  if (size <= 0) {
    return '0 bytes';
  }
  const units = ['bytes', 'kB', 'MB', 'GB'];
  const index = Math.floor(Math.log(size) / Math.log(KB));
  return `${(size / Math.pow(KB, index)).toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

function sizes(budget: Budget, stats: BudgetStats): {label: string; size: number}[] {
  const sum = (files: {size: number}[]) => files.reduce((total, f) => total + f.size, 0);
  const scripts = stats.files.filter((f) => f.name.endsWith('.js'));
  switch (budget.type) {
    case 'initial':
      return [{label: 'bundle initial', size: sum(stats.files.filter((f) => f.initial))}];
    case 'all':
      return [{label: 'total', size: sum(stats.files)}];
    case 'allScript':
      return [{label: 'total scripts', size: sum(scripts)}];
    case 'any':
      return stats.files.map((f) => ({label: f.name, size: f.size}));
    case 'anyScript':
      return scripts.map((f) => ({label: f.name, size: f.size}));
    case 'anyComponentStyle':
      return stats.componentStyles;
    case 'bundle':
      return budget.name ? [{label: budget.name, size: sum(stats.files.filter((f) => f.names.includes(budget.name!)))}] : [];
  }
}

export function* checkBudgets(budgets: Budget[], stats: BudgetStats): Generator<BudgetFailure> {
  for (const budget of budgets) {
    for (const {label, size} of sizes(budget, stats)) {
      for (const threshold of thresholds(budget)) {
        if (threshold.type === 'maximum' && size > threshold.limit) {
          yield {
            severity: threshold.severity,
            label,
            message: `${label} exceeded maximum budget. Budget ${formatSize(threshold.limit)} was not met by ${formatSize(size - threshold.limit)} with a total of ${formatSize(size)}.`,
          };
        } else if (threshold.type === 'minimum' && size < threshold.limit) {
          yield {
            severity: threshold.severity,
            label,
            message: `${label} failed to meet minimum budget. Budget ${formatSize(threshold.limit)} was not met by ${formatSize(threshold.limit - size)} with a total of ${formatSize(size)}.`,
          };
        }
      }
    }
  }
}

/**
 * Turns Rolldown's output into budget stats. Initial means what the page loads before it runs:
 * every entry chunk, the chunks they import statically, and the CSS those chunks import. A chunk's
 * names are its Rolldown name (`index` for the chunk index.html loads, a lazy route's file name
 * for its chunk), plus the file name of every app entry it holds, so `main` names the chunk with
 * `src/main.ts` in it, as it does for the CLI.
 */
export function bundleStats(bundle: OutputBundle, entries: string[], componentStyles: BudgetStats['componentStyles']): BudgetStats {
  const chunks = Object.values(bundle).filter((o): o is OutputChunk => o.type === 'chunk');
  const initial = new Set<string>();
  const visit = (fileName: string) => {
    const chunk = bundle[fileName];
    if (initial.has(fileName) || chunk?.type !== 'chunk') {
      return;
    }
    initial.add(fileName);
    for (const css of chunk.viteMetadata?.importedCss ?? []) {
      initial.add(css);
    }
    chunk.imports.forEach(visit);
  };
  chunks.filter((c) => c.isEntry && !c.isDynamicEntry).forEach((c) => visit(c.fileName));

  const entryNames = new Map(entries.map((e) => [path.resolve(e), path.basename(e).replace(/\.[^.]+$/, '')]));
  const files: BudgetStats['files'] = [];
  for (const output of Object.values(bundle)) {
    if (!/\.(js|css)$/.test(output.fileName)) {
      continue;
    }
    const names = new Set<string>();
    if (output.type === 'chunk') {
      names.add(output.name);
      for (const id of output.isEntry ? output.moduleIds : []) {
        const name = entryNames.get(id);
        if (name) {
          names.add(name);
        }
      }
    } else {
      for (const name of output.names) {
        names.add(name.replace(/\.[^.]+$/, ''));
      }
    }
    const size = output.type === 'chunk' ? Buffer.byteLength(output.code) : Buffer.byteLength(output.source);
    files.push({name: output.fileName, size, initial: initial.has(output.fileName), names: [...names]});
  }
  return {files, componentStyles};
}

/** What the budgets plugin needs from the compiler plugin. */
export interface BudgetsPluginContext {
  entries(): string[];
  componentStyles(file: string): Promise<({label: string; file: string} | {label: string; size: number})[]>;
}

/** A stylesheet imported as a string, the way builds inline component stylesheets. */
const INLINE_STYLESHEET = /\.(?:css|less|sass|scss|styl|stylus|pcss|postcss|sss)\?(?:[^#]*&)?inline(?:&|$)/;

/**
 * Checks the browser build against `budgets` once Rolldown has rendered it: warnings are logged,
 * and any error fails the build after every failure is logged. Server bundles aren't checked, as
 * in the CLI.
 *
 * `anyComponentStyle` measures a `styleUrl` file the way the CLI does: compiled, then minified
 * with esbuild, before view encapsulation adds its attribute selectors. Here compiled means by
 * Vite's CSS pipeline, so this plugin has to run after `vite:css` and before the styles plugin
 * scopes the CSS. Inline `styles` are compiled by ngp, which ships them as written, so they're
 * measured as written.
 */
export function budgetsPlugin(budgets: Budget[], api: BudgetsPluginContext): Plugin {
  /** Each component stylesheet's minified size, by file. */
  const stylesheets = new Map<string, number>();
  const measureStyles = budgets.some((b) => b.type === 'anyComponentStyle');
  return {
    name: 'vite-plugin-ngp:budgets',
    apply: 'build',
    applyToEnvironment: (environment) => environment.config.consumer === 'client',
    transform: {
      filter: {id: INLINE_STYLESHEET},
      async handler(css, id) {
        if (measureStyles) {
          const esbuild = await import('esbuild');
          const minified = await esbuild.transform(css, {loader: 'css', minify: true});
          stylesheets.set(id.replace(/[?#].*$/, ''), Buffer.byteLength(minified.code));
        }
        return null;
      },
    },
    async generateBundle(_options, bundle) {
      // By label: a stylesheet two components share counts once.
      const componentStyles = new Map<string, number>();
      if (measureStyles) {
        const modules = new Set(Object.values(bundle).flatMap((o) => (o.type === 'chunk' ? o.moduleIds : [])));
        for (const id of modules) {
          if (!/\.[cm]?ts$/.test(id) || /[\\/]node_modules[\\/]/.test(id)) {
            continue;
          }
          for (const style of await api.componentStyles(id)) {
            const size = 'size' in style ? style.size : stylesheets.get(style.file);
            if (size !== undefined) {
              componentStyles.set(style.label, size);
            }
          }
        }
      }
      const failures = [...checkBudgets(budgets, bundleStats(bundle, api.entries(), [...componentStyles].map(([label, size]) => ({label, size}))))];
      const logger = this.environment.logger;
      for (const failure of failures) {
        if (failure.severity === 'warning') {
          logger.warn(`▲ [WARNING] ${failure.message}`);
        } else {
          logger.error(`✘ [ERROR] ${failure.message}`);
        }
      }
      const errors = failures.filter((f) => f.severity === 'error');
      if (errors.length > 0) {
        this.error(`${errors.length} budget${errors.length === 1 ? '' : 's'} exceeded: ${errors.map((e) => e.label).join(', ')}`);
      }
    },
  };
}
