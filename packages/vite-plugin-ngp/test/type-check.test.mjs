// Type-checking (decision 21 in docs/decisions.md): tsgo checks the app plus ngp's type-check
// blocks, and errors inside a block are mapped back to the template. The unit tests pin the
// mapping rules; the end-to-end test plants errors in a small app and checks where they land.
// Run `pnpm build` first; the end-to-end test needs an ngp toolchain build.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NgpCompiler} from '../dist/compiler.js';
import {TypeChecker} from '../dist/type-check.js';
import {codeFrame, locateInTemplate, parseTscOutput} from '../dist/type-check-diagnostics.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const toolchainDir = process.env.NGP_TOOLCHAIN ?? path.join(repo, 'toolchain/out');

/** A block shaped like ngp's, for a component at /app/cmp.ts. */
function block(body, sources) {
  return [
    '/**',
    ' * TCB for /app/cmp.ts',
    ' * @generated',
    ' */',
    '',
    "import * as i0 from './cmp';",
    '',
    '/*tcb1*/',
    'function _tcb1(this: i0.Cmp) {',
    ...body,
    '}',
    '',
    sources ? `/*ngp-tcb-template-sources:${JSON.stringify(sources)}*/` : '',
  ].join('\n');
}

/** 1-based line and column of the first `needle` in `text`. */
function at(text, needle) {
  const offset = text.indexOf(needle);
  assert.ok(offset >= 0, needle);
  const before = text.slice(0, offset);
  return [before.split('\n').length, offset - before.lastIndexOf('\n')];
}

test('parses tsc output, with message chains and global errors', () => {
  const output = [
    'src/a.ts(3,7): error TS2322: Type \'string\' is not assignable to type \'number\'.',
    "error TS2688: Cannot find type definition file for 'vite/client'.",
    '  The file is in the program because:',
    '',
    'Found 2 errors.',
  ].join('\n');
  assert.deepEqual(parseTscOutput(output, '/app'), [
    {file: '/app/src/a.ts', line: 3, column: 7, code: 'TS2322', message: "Type 'string' is not assignable to type 'number'."},
    {code: 'TS2688', message: "Cannot find type definition file for 'vite/client'.\n  The file is in the program because:"},
  ]);
});

test('maps an error to the start of the first span after it, in the template file', () => {
  const tcb = block(['if (true) {', '"" + ((this).modee /*42,47*/);', '}'], {tcb1: {templateFile: '/app/cmp.html'}});
  assert.deepEqual(locateInTemplate(tcb, ...at(tcb, 'modee')), {file: '/app/cmp.html', offset: 42});
});

test('maps an inline template to offsets in the component file', () => {
  const tcb = block(['if (true) {', '"" + ((this).modee /*120,125*/);', '}']);
  assert.deepEqual(locateInTemplate(tcb, ...at(tcb, 'modee')), {file: '/app/cmp.ts', offset: 120});
});

test('maps host bindings to the component file, even with an external template', () => {
  const tcb = block(
    ['if (true) {', '"" + ((this).a /*1,2*/);', '}', 'if ((true /*hostBindingsBlockGuard*/)) {', '(this).hostTypo /*300,308*/;', '}'],
    {tcb1: {templateFile: '/app/cmp.html'}},
  );
  assert.deepEqual(locateInTemplate(tcb, ...at(tcb, 'hostTypo')), {file: '/app/cmp.ts', offset: 300});
});

test('maps a template given as an expression to that expression', () => {
  const tcb = block(['if (true) {', '"" + ((this).modee /*3,8*/);', '}'], {tcb1: {templateExpression: {start: 210, end: 218}}});
  assert.deepEqual(locateInTemplate(tcb, ...at(tcb, 'modee')), {file: '/app/cmp.ts', offset: 210});
});

test('drops errors under a D:ignore marker', () => {
  const tcb = block(['if (true) {', '(this).items /*5,10*/.map(c /*D:ignore*/ => c /*12,13*/);', '}']);
  assert.equal(locateInTemplate(tcb, ...at(tcb, 'c /*D:ignore')), 'ignore');
});

test('leaves files that are not type-check blocks alone', () => {
  assert.equal(locateInTemplate('const a: number = "x";\n', 1, 7), null);
});

test('frames the line with a caret under the column', () => {
  assert.equal(codeFrame('a\nbcd\ne', 2, 2), '  1 | a\n> 2 | bcd\n    |  ^\n  3 | e');
});

const APP_TS = `import {Component} from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.html',
  host: {'[title]': 'hostTitel'},
})
export class App {
  title = 'ngp';
  hostTitle = 'host';
}
`;

const INLINE_TS = `import {Component, input} from '@angular/core';

@Component({
  selector: 'app-badge',
  template: \`<span>{{ label().toUpperCase() }}</span>
    <span>{{ count.toFixed() }}</span>\`,
})
export class Badge {
  label = input('');
  count = input(0);
}
`;

const MAIN_TS = `import {App} from './app';
import {Badge} from './badge';

export const components = [App, Badge];
export function unused() {
  const value: number = 'x';
}
`;

test('reports planted errors at template locations, and nothing for a clean app', async (t) => {
  // Inside the repo, so the app resolves @angular/core from the repo's node_modules.
  const dir = await fs.mkdtemp(path.join(repo, 'node_modules/.cache-type-check-'));
  t.after(() => fs.rm(dir, {recursive: true, force: true}));
  const src = path.join(dir, 'src');
  await fs.mkdir(src, {recursive: true});
  const tsconfig = path.join(dir, 'tsconfig.json');
  await fs.writeFile(
    tsconfig,
    JSON.stringify({
      compilerOptions: {strict: true, target: 'ES2022', module: 'preserve', skipLibCheck: true, types: [], noUnusedLocals: true},
      angularCompilerOptions: {strictTemplates: true},
      include: ['src/**/*.ts'],
    }),
  );
  await fs.writeFile(path.join(src, 'app.ts'), APP_TS);
  await fs.writeFile(path.join(src, 'app.html'), '<h1>\n  {{ titel }}\n</h1>\n');
  await fs.writeFile(path.join(src, 'badge.ts'), INLINE_TS);
  await fs.writeFile(path.join(src, 'main.ts'), MAIN_TS);

  const compiler = await NgpCompiler.create({toolchainDir, engine: 'native', tsconfig, analyzerTsconfig: tsconfig, enableHmr: false});
  t.after(() => compiler.close());
  const checker = new TypeChecker({tsconfig, outDir: path.join(dir, 'node_modules/.vite/type-check'), cwd: dir});
  const check = async () => {
    const {diagnostics} = await checker.check(await compiler.typeCheckBlocks(checker.programFiles()));
    return diagnostics.map((d) => `${path.relative(dir, d.file ?? '')}:${d.line}:${d.column} ${d.code}`);
  };

  assert.deepEqual(await check(), [
    'src/app.html:2:6 TS2551',
    'src/app.ts:6:22 TS2551',
    'src/badge.ts:6:20 TS2339',
    'src/main.ts:6:9 TS6133',
    'src/main.ts:6:9 TS2322',
  ].sort((a, b) => a.localeCompare(b, 'en', {numeric: true})));

  // Fix everything, through the analyzer as an edit would, and on disk for TypeScript.
  const fixes = {
    'app.html': (s) => s.replace('titel', 'title'),
    'app.ts': (s) => s.replace('hostTitel', 'hostTitle'),
    'badge.ts': (s) => s.replace('count.toFixed()', 'count().toFixed()'),
    'main.ts': (s) => s.replace(/export function unused[^]*$/, ''),
  };
  for (const [name, fix] of Object.entries(fixes)) {
    const file = path.join(src, name);
    const fixed = fix(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, fixed);
    await compiler.update(file, fixed, 'watcher');
  }
  assert.deepEqual(await check(), []);
});
