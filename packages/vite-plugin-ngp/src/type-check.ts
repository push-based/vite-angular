import {spawn, type ChildProcess} from 'node:child_process';
import * as fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as path from 'node:path';
import {readConfiguration} from '@angular/compiler-cli';
import type {ViteDevServer} from 'vite';
import {
  codeFrame,
  formatDiagnostic,
  isIgnoredInTcb,
  lineAndColumn,
  locateInTemplate,
  parseTscOutput,
  type Diagnostic,
} from './type-check-diagnostics.js';

export interface TypeCheckerOptions {
  /** The app's tsconfig. The check extends it. */
  tsconfig: string;
  /** Where the type-check blocks, the check's tsconfig and its build info go. */
  outDir: string;
  /** Working directory for tsgo, which prints paths relative to it. */
  cwd: string;
}

export interface CheckedDiagnostic extends Diagnostic {
  /** Source lines around the error, when it has a location. */
  frame?: string;
}

export interface TypeCheckResult {
  diagnostics: CheckedDiagnostic[];
  durationMs: number;
}

/**
 * Type-checks the app the way ngc would: TypeScript 7 (`tsgo`) checks the app's own sources
 * together with ngp's type-check blocks, in a child process.
 *
 * The blocks are written under `outDir`, at each component's absolute path, and the check's
 * tsconfig lists them in `rootDirs` next to the filesystem root. Their relative imports, like
 * `import * as i0 from './app'`, then resolve to the app's sources, and TypeScript reports errors
 * in those sources at their real positions. Errors inside a block are mapped to the template.
 */
export class TypeChecker {
  private readonly tcbDir: string;
  private readonly configFile: string;
  /** Block contents on disk, by block path. */
  private readonly written = new Map<string, string>();
  private rootNames: string[] | null = null;
  private child: ChildProcess | null = null;

  constructor(private readonly options: TypeCheckerOptions) {
    this.tcbDir = path.join(options.outDir, 'blocks');
    this.configFile = path.join(options.outDir, 'tsconfig.json');
  }

  /** The app's .ts files, as its tsconfig includes them: these are what get checked. */
  programFiles(): string[] {
    this.rootNames ??= readConfiguration(this.options.tsconfig)
      .rootNames.filter((f) => /\.[cm]?ts$/.test(f) && !/\.d\.[cm]?ts$/.test(f))
      .map((f) => path.resolve(f));
    return this.rootNames;
  }

  /** Call when a file is added or deleted, so the next check re-expands the tsconfig's globs. */
  filesChanged(): void {
    this.rootNames = null;
  }

  /** Runs one check over `blocks`, the type-check block of each component file. */
  async check(blocks: Map<string, string>): Promise<TypeCheckResult> {
    const started = performance.now();
    const snapshot = await this.writeBlocks(blocks);
    await this.writeConfig([...snapshot.keys()]);
    const output = await this.runTsgo();
    const raw = parseTscOutput(output.text, this.options.cwd);
    const diagnostics = await this.map(raw, snapshot);
    // tsgo failed without printing a single error: a crash, or a missing binary.
    if (raw.length === 0 && output.code !== 0) {
      diagnostics.push({code: 'TS0', message: `tsgo exited with code ${output.code}:\n${output.text.trim()}`});
    }
    return {diagnostics, durationMs: performance.now() - started};
  }

  /** Stops a running tsgo. The check it belongs to then resolves with whatever it printed. */
  abort(): void {
    this.child?.kill();
  }

  private runTsgo(): Promise<{code: number | null; text: string}> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [tsgoBin(), '-p', this.configFile, '--pretty', 'false'], {cwd: this.options.cwd});
      this.child = child;
      let text = '';
      child.stdout.on('data', (chunk) => (text += chunk));
      child.stderr.on('data', (chunk) => (text += chunk));
      child.on('error', reject);
      child.on('close', (code) => {
        this.child = null;
        resolve({code, text});
      });
    });
  }

  private blockPath(file: string): string {
    const relative = path.relative(path.parse(file).root, file);
    return path.join(this.tcbDir, relative.replace(/\.[cm]?ts$/, '.ngtypecheck.ts'));
  }

  /** Writes blocks that changed, deletes ones that are gone, and returns what's on disk now. */
  private async writeBlocks(blocks: Map<string, string>): Promise<Map<string, string>> {
    const next = new Map<string, string>();
    for (const [file, tcb] of blocks) {
      next.set(this.blockPath(file), tcb);
    }
    const writes: Promise<unknown>[] = [];
    for (const [block, tcb] of next) {
      if (this.written.get(block) !== tcb) {
        writes.push(fs.mkdir(path.dirname(block), {recursive: true}).then(() => fs.writeFile(block, tcb)));
      }
    }
    for (const block of this.written.keys()) {
      if (!next.has(block)) {
        writes.push(fs.rm(block, {force: true}));
      }
    }
    await Promise.all(writes);
    this.written.clear();
    for (const [block, tcb] of next) {
      this.written.set(block, tcb);
    }
    return next;
  }

  private async writeConfig(blocks: string[]): Promise<void> {
    const fsRoot = path.parse(this.options.tsconfig).root;
    const userRootDirs = (readConfiguration(this.options.tsconfig).options.rootDirs as string[] | undefined) ?? [];
    const config = {
      extends: this.options.tsconfig,
      compilerOptions: {
        noEmit: true,
        emitDeclarationOnly: false,
        declaration: false,
        composite: false,
        // Rechecks only what an edit can affect. The build info is a cache, kept next to the blocks.
        incremental: true,
        tsBuildInfoFile: path.join(this.options.outDir, 'tsconfig.tsbuildinfo'),
        // The blocks live outside the app. With a narrower rootDir, TypeScript would reject them.
        rootDir: fsRoot,
        rootDirs: [this.tcbDir, fsRoot, ...userRootDirs],
      },
      // `include` is inherited from the app's tsconfig, so the app's own sources are checked too.
      files: blocks.sort(),
    };
    await fs.mkdir(this.options.outDir, {recursive: true});
    await fs.writeFile(this.configFile, JSON.stringify(config, null, 2) + '\n');
  }

  private async map(raw: Diagnostic[], blocks: Map<string, string>): Promise<CheckedDiagnostic[]> {
    const texts = new Map<string, Promise<string | null>>();
    const read = (file: string) => {
      let text = texts.get(file);
      if (!text) {
        text = fs.readFile(file, 'utf8').catch(() => null);
        texts.set(file, text);
      }
      return text;
    };
    const out = new Map<string, CheckedDiagnostic>();
    for (const d of raw) {
      let mapped: CheckedDiagnostic = d;
      const tcb = d.file ? blocks.get(path.resolve(d.file)) : undefined;
      if (tcb !== undefined && d.line && d.column) {
        if (isIgnoredInTcb(d.code)) {
          continue;
        }
        const location = locateInTemplate(tcb, d.line, d.column);
        if (location === 'ignore') {
          continue;
        }
        if (location) {
          const text = await read(location.file);
          if (text !== null) {
            mapped = {...d, file: location.file, ...lineAndColumn(text, location.offset)};
          }
        }
      }
      if (mapped.file && mapped.line && mapped.column) {
        const text = await read(mapped.file);
        if (text !== null) {
          mapped = {...mapped, frame: codeFrame(text, mapped.line, mapped.column)};
        }
      }
      // Two components can share a template; report each error there once.
      out.set(`${mapped.file}:${mapped.line}:${mapped.column}:${mapped.code}:${mapped.message}`, mapped);
    }
    return [...out.values()].sort(
      (a, b) => (a.file ?? '').localeCompare(b.file ?? '') || (a.line ?? 0) - (b.line ?? 0) || (a.column ?? 0) - (b.column ?? 0),
    );
  }
}

/** TypeScript 7's CLI, installed as `typescript7` because Angular needs `typescript` 6 by name. */
function tsgoBin(): string {
  const require = createRequire(import.meta.url);
  return path.join(path.dirname(require.resolve('typescript7/package.json')), 'bin/tsc');
}

/**
 * Runs checks after edits without ever running two at once. Each `schedule()` restarts a short
 * wait. A request that arrives while a check runs starts one more check when it finishes.
 */
export class CheckScheduler {
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<void> | null = null;
  private again = false;
  private closed = false;

  constructor(
    private readonly run: () => Promise<void>,
    private readonly delayMs: number,
  ) {}

  schedule(delayMs = this.delayMs): void {
    if (this.closed) {
      return;
    }
    if (this.running) {
      this.again = true;
      return;
    }
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      this.running = this.run().finally(() => {
        this.running = null;
        if (this.again) {
          this.again = false;
          this.schedule();
        }
      });
    }, delayMs);
  }

  /** Cancels a pending check, and resolves when a running one has finished. */
  async close(): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.again = false;
    this.closed = true;
    await this.running;
  }
}

/**
 * Whether the dev server is busy: answering a request, or compiling a module. `whenIdle` tells
 * when it has done neither for a while, which on a big app is when the first page has loaded.
 */
export class ServerActivity {
  private inFlight = 0;
  private timer: NodeJS.Timeout | null = null;
  private readonly waiters = new Set<() => void>();

  /** @param quietMs how long nothing has to be in flight before the server counts as idle. */
  constructor(private readonly quietMs: number) {}

  /** Marks the start of a request or a compile. Returns what marks its end; calling it twice is fine. */
  begin(): () => void {
    this.inFlight++;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    let ended = false;
    return () => {
      if (ended) {
        return;
      }
      ended = true;
      this.inFlight--;
      this.arm();
    };
  }

  /** A middleware that counts every request the server answers, until its response closes. */
  middleware = (_req: unknown, res: {once(event: 'close', listener: () => void): unknown}, next: () => void): void => {
    res.once('close', this.begin());
    next();
  };

  /** Resolves once nothing has been in flight for `quietMs`, or after `maxWaitMs`, whichever is first. */
  whenIdle(maxWaitMs: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(cap);
        this.waiters.delete(done);
        resolve();
      };
      const cap = setTimeout(done, maxWaitMs);
      cap.unref();
      this.waiters.add(done);
      this.arm();
    });
  }

  private arm(): void {
    if (this.inFlight > 0 || this.waiters.size === 0 || this.timer) {
      return;
    }
    this.timer = setTimeout(() => {
      this.timer = null;
      for (const waiter of [...this.waiters]) {
        waiter();
      }
    }, this.quietMs);
    this.timer.unref();
  }
}

/** The browser module that shows type errors in Vite's overlay, served at this URL in dev. */
export const OVERLAY_CLIENT_URL = '/@ngp/type-check-client.js';
export const OVERLAY_CLIENT_ID = '\0vite-plugin-ngp:type-check-client';
const EVENT = 'ngp:type-check';

/**
 * Opens Vite's own error overlay for type errors and closes it when they're fixed. Vite closes its
 * overlay only on the next module update or reload, and a template edit applied in place is
 * neither, so the overlay is driven from here. It only closes overlays it opened itself.
 */
export const OVERLAY_CLIENT = `
if (import.meta.hot) {
  const owned = 'data-ngp-type-check';
  import.meta.hot.on(${JSON.stringify(EVENT)}, ({error}) => {
    document.querySelectorAll('vite-error-overlay[' + owned + ']').forEach((el) => el.close());
    const Overlay = customElements.get('vite-error-overlay');
    if (error && Overlay) {
      const overlay = new Overlay(error);
      overlay.setAttribute(owned, '');
      document.body.appendChild(overlay);
    }
  });
  import.meta.hot.send(${JSON.stringify(EVENT + ':ready')});
}
`;

/** The errors as text: `file:line:col - error TSxxxx: message`, each followed by its frame if asked. */
export function formatReport(diagnostics: CheckedDiagnostic[], root: string, frames: boolean): string {
  return diagnostics
    .map((d) => formatDiagnostic(d, root) + (frames && d.frame ? '\n' + d.frame : ''))
    .join(frames ? '\n\n' : '\n');
}

function summary(diagnostics: CheckedDiagnostic[], durationMs: number): string {
  const n = diagnostics.length;
  return `type-check: ${n === 0 ? 'no errors' : `${n} error${n === 1 ? '' : 's'}`} (${Math.round(durationMs)} ms)`;
}

/** Fails the build on any error. */
export function buildReport(result: TypeCheckResult, root: string): {error?: string; info: string} {
  const info = `[vite-plugin-ngp] ${summary(result.diagnostics, result.durationMs)}`;
  return result.diagnostics.length > 0 ? {info, error: `${info}\n\n${formatReport(result.diagnostics, root, true)}`} : {info};
}

/** The first check starts this long after the dev server last answered a request or compiled a module. */
export const FIRST_CHECK_QUIET_MS = 500;
/** Or this long after the server started listening, if it never goes quiet for that long. */
export const FIRST_CHECK_MAX_WAIT_MS = 60_000;

/**
 * Checks once the dev server has gone idle after starting, and after every edit, debounced, and
 * reports to the terminal and the overlay. Reports go out only when the set of errors changes, so
 * an unrelated edit doesn't print the same errors again.
 */
export function startDevTypeCheck(options: {
  server: ViteDevServer;
  /** What the server is doing. The middleware is installed here; compiles are marked by the caller. */
  activity: ServerActivity;
  run: () => Promise<TypeCheckResult>;
  /** Called when a .ts file is added or deleted. */
  filesChanged: () => void;
  /** Stops a running check. */
  abort: () => void;
  overlay: boolean;
}): {schedule(): void; close(): Promise<void>} {
  const {server} = options;
  const logger = server.config.logger;
  const root = server.config.root;
  const hot = server.environments.client.hot;
  let reported = '';
  let overlayError: object | null = null;
  let closed = false;

  const scheduler = new CheckScheduler(async () => {
    let result: TypeCheckResult;
    try {
      result = await options.run();
    } catch (error) {
      if (closed) {
        return;
      }
      logger.error(`[vite-plugin-ngp] type-check failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`, {timestamp: true});
      return;
    }
    const {diagnostics} = result;
    const text = formatReport(diagnostics, root, true);
    if (closed || text === reported) {
      return;
    }
    const firstReport = reported === '' && diagnostics.length === 0;
    reported = text;
    if (diagnostics.length > 0) {
      logger.error(`[vite-plugin-ngp] ${summary(diagnostics, result.durationMs)}\n\n${text}\n`, {timestamp: true});
    } else if (!firstReport) {
      logger.info(`[vite-plugin-ngp] ${summary(diagnostics, result.durationMs)}`, {timestamp: true});
    }
    const first = diagnostics[0];
    overlayError = first
      ? {
          plugin: 'vite-plugin-ngp:type-check',
          message: `${summary(diagnostics, result.durationMs)}\n\n${formatReport(diagnostics, root, false)}`,
          id: first.file,
          frame: first.frame,
          loc: first.file && first.line ? {file: first.file, line: first.line, column: first.column} : undefined,
          stack: '',
        }
      : null;
    if (options.overlay) {
      hot.send(EVENT, {error: overlayError});
    }
  }, 300);

  if (options.overlay) {
    // A page that loads after the check ran asks for the current errors.
    hot.on(`${EVENT}:ready`, (_data: unknown, client: {send(event: string, payload?: unknown): void}) => {
      client.send(EVENT, {error: overlayError});
    });
  }
  // A new or deleted .ts file can change what the tsconfig includes.
  const filesChanged = (file: string) => {
    if (/\.[cm]?ts$/.test(file)) {
      options.filesChanged();
      scheduler.schedule();
    }
  };
  server.watcher.on('add', filesChanged);
  server.watcher.on('unlink', filesChanged);
  // The first check waits until the server is idle. Generating every component's block runs on the
  // server's thread, and while the first page is compiling, everything on that thread waits for it.
  // In the middleware chain this runs before Vite's own, so it sees every request.
  server.middlewares.use(options.activity.middleware);
  const first = () => {
    void options.activity.whenIdle(FIRST_CHECK_MAX_WAIT_MS).then(() => scheduler.schedule(0));
  };
  if (server.httpServer) {
    server.httpServer.once('listening', first);
  } else {
    first();
  }
  return {
    schedule: () => scheduler.schedule(),
    async close() {
      closed = true;
      options.abort();
      await scheduler.close();
    },
  };
}
