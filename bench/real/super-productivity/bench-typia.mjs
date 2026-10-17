// Runs typia's compile-time transform under Vite, for Super Productivity.
//
// The app validates data with typia: `typia.assert<Task>(x)` is a placeholder that a TypeScript
// transformer replaces with a generated validator at compile time, using the type checker.
// tsconfig.base.json registers it (`plugins: [{transform: 'typia/lib/transform'}]`) and
// `ts-patch` makes the TypeScript compiler run it, so `ng build` and `ng serve` get it for free.
// Vite's per-file transform has no type checker and runs no TypeScript transformers; left alone,
// the first `typia.createAssert()` throws at startup.
//
// So this plugin does what a Vite user has to do, by hand or with unplugin-typia: build a
// TypeScript program over the app's tsconfig, and for each module that mentions typia, run
// typia's transformer on the program's source file and print the result. It prints TypeScript,
// not JavaScript, and leaves decorators alone, so vite-plugin-ngp still gets to compile the
// Angular parts. Everything runs with the app's own typescript and typia.
//
// The cost is the program: TypeScript parses the whole app before the first typia module can be
// served, several seconds, once per dev-server start and once per build. unplugin-typia pays the
// same. The dev server logs it.

import {createRequire} from 'node:module';
import * as path from 'node:path';

export function typiaTransform({root, tsconfig}) {
  const require = createRequire(path.join(root, 'package.json'));
  const ts = require('typescript');
  const typia = require('typia/lib/transform');
  const transform = typia.transform ?? typia.default;
  let program = null;
  let stale = true;
  let logger = console;

  const getProgram = () => {
    if (program && !stale) return program;
    const t0 = performance.now();
    const parsed = ts.getParsedCommandLineOfConfigFile(path.join(root, tsconfig), {}, {
      ...ts.sys,
      onUnRecoverableConfigFileDiagnostic: (d) => {
        throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
      },
    });
    program = ts.createProgram({rootNames: parsed.fileNames, options: parsed.options, oldProgram: program ?? undefined});
    stale = false;
    logger.info(`[bench:typia] TypeScript program ${program ? 'updated' : 'built'} in ${Math.round(performance.now() - t0)} ms`);
    return program;
  };

  return {
    name: 'bench:typia',
    enforce: 'pre',
    configResolved(config) {
      logger = config.logger;
    },
    watchChange() {
      stale = true;
    },
    transform(code, id) {
      const file = id.split('?')[0];
      if (!file.endsWith('.ts') || file.includes('/node_modules/') || !/\btypia\b/.test(code)) return null;
      const t0 = performance.now();
      const p = getProgram();
      const sf = p.getSourceFile(file);
      if (!sf) return null;
      const diagnostics = [];
      const result = ts.transform(sf, [transform(p, undefined, {addDiagnostic: (d) => diagnostics.push(d)})], p.getCompilerOptions());
      const out = ts.createPrinter({newLine: ts.NewLineKind.LineFeed}).printFile(result.transformed[0]);
      result.dispose();
      for (const d of diagnostics) this.warn(`typia: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
      logger.info(`[bench:typia] ${path.relative(root, file)} in ${Math.round(performance.now() - t0)} ms`);
      return {code: out, map: null};
    },
  };
}
