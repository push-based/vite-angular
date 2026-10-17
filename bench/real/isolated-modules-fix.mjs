// Rewrites an app's type-only imports and re-exports as `import type` / `export type`, where
// TypeScript's `isolatedModules` check demands it (TS1205, TS1448), using TypeScript's own quick
// fix for each error. Nothing else changes.
//
// Why: a per-file compiler, which is what Vite is, can't tell a type from a value in another
// file. `export {SomeInterface} from './x'` compiles to a runtime re-export of nothing, and the
// browser refuses to link the module. `ng build` emits with the whole program's types and never
// hits this, so an app can be years old and not know. The fix is the one `ng new` has shipped
// with since Angular 19: `isolatedModules: true`, and these keywords.
//
// Usage: node isolated-modules-fix.mjs <app dir> <tsconfig, relative to the app>
// Then `git diff` in the app gives the patch, and bench/real/<name>.patch keeps it.

import {createRequire} from 'node:module';
import * as fs from 'node:fs';
import * as path from 'node:path';

const [appDir, tsconfigRel] = process.argv.slice(2);
if (!appDir || !tsconfigRel) throw new Error('Usage: node isolated-modules-fix.mjs <app dir> <tsconfig>');
const ts = createRequire(path.join(path.resolve(appDir), 'package.json'))('typescript');
const CODES = [1205, 1448];

const tsconfig = path.resolve(appDir, tsconfigRel);
const parsed = ts.getParsedCommandLineOfConfigFile(tsconfig, {isolatedModules: true, noEmit: true}, {
  ...ts.sys,
  onUnRecoverableConfigFileDiagnostic: (d) => {
    throw new Error(ts.flattenDiagnosticMessageText(d.messageText, '\n'));
  },
});
const files = new Map(parsed.fileNames.map((f) => [f, {version: 0, text: fs.readFileSync(f, 'utf8')}]));
const host = {
  getScriptFileNames: () => [...files.keys()],
  getScriptVersion: (f) => String(files.get(f)?.version ?? 0),
  getScriptSnapshot: (f) => {
    const known = files.get(f);
    if (known) return ts.ScriptSnapshot.fromString(known.text);
    return fs.existsSync(f) ? ts.ScriptSnapshot.fromString(fs.readFileSync(f, 'utf8')) : undefined;
  },
  getCurrentDirectory: () => path.resolve(appDir),
  getCompilationSettings: () => parsed.options,
  getDefaultLibFileName: (o) => ts.getDefaultLibFilePath(o),
  fileExists: ts.sys.fileExists,
  readFile: ts.sys.readFile,
  readDirectory: ts.sys.readDirectory,
  directoryExists: ts.sys.directoryExists,
  getDirectories: ts.sys.getDirectories,
};
const service = ts.createLanguageService(host, ts.createDocumentRegistry());

// The tsconfig's own file list is often just the entry points (Ghostfolio's names two files); the
// program reaches the rest through imports. Check every file in it that belongs to the app.
const appFiles = () =>
  service
    .getProgram()
    .getSourceFiles()
    .map((sf) => sf.fileName)
    .filter((f) => !f.includes('/node_modules/') && !f.endsWith('.d.ts') && f.startsWith(path.resolve(appDir)));
for (const f of appFiles()) if (!files.has(f)) files.set(f, {version: 0, text: fs.readFileSync(f, 'utf8')});

let changed = 0;
let fixed = 0;
// Fixes shift positions, so take one error per file per round, apply, and look again.
for (let round = 0; round < 50; round++) {
  let any = false;
  for (const [file, state] of files) {
    if (file.includes('/node_modules/') || file.endsWith('.d.ts')) continue;
    const errors = service.getSemanticDiagnostics(file).filter((d) => CODES.includes(d.code) && d.start != null);
    if (errors.length === 0) continue;
    const d = errors[0];
    const fixes = service.getCodeFixesAtPosition(file, d.start, d.start + d.length, [d.code], {}, {});
    const fix = fixes.find((f) => f.changes.some((c) => c.fileName === file));
    if (!fix) {
      console.error(`no quick fix for TS${d.code} at ${path.relative(appDir, file)}:${d.start}: ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`);
      continue;
    }
    for (const change of fix.changes) {
      if (change.fileName !== file) continue;
      let text = state.text;
      for (const tc of [...change.textChanges].sort((a, b) => b.span.start - a.span.start)) {
        text = text.slice(0, tc.span.start) + tc.newText + text.slice(tc.span.start + tc.span.length);
      }
      if (text !== state.text) {
        if (state.version === 0) changed++;
        state.text = text;
        state.version++;
        fixed++;
        any = true;
      }
    }
  }
  if (!any) break;
}
for (const [file, state] of files) if (state.version > 0) fs.writeFileSync(file, state.text);
const left = [...files.keys()].filter((f) => !f.includes('/node_modules/') && !f.endsWith('.d.ts')).flatMap((f) => service.getSemanticDiagnostics(f).filter((d) => CODES.includes(d.code)));
console.log(`${fixed} fixes in ${changed} files; ${left.length} isolatedModules errors left`);
