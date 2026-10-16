// Which .ts edits update a component in place, and which reload the page (docs/decisions.md, the
// entry that supersedes 15). The first tests check the eligibility rules alone. The last one runs
// them through ngp on a playground component. Run `pnpm build` first; the last test needs an ngp
// toolchain build.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NgpCompiler} from '../dist/compiler.js';
import {hmrCandidates} from '../dist/hmr-candidates.js';

const BASE = `import {Component, input} from '@angular/core';
import {Icon} from './icon';

const GREETING = 'hi';

/** A counter. */
@Component({
  selector: 'app-counter',
  imports: [Icon],
  template: \`<p>{{ count }}</p>\`,
  styles: \`p { color: red; }\`,
})
export class Counter {
  count = 0;
  readonly label = input('');
  increment() {
    this.count++;
  }
}

@Component({
  selector: 'app-other',
  template: '<span>other</span>',
})
export class Other {}

export class Plain {}
`;

const components = (name) => name === 'Counter' || name === 'Other';
const check = (updated, stale = BASE) => hmrCandidates('/app/counter.ts', stale, updated, components);
const edit = (from, to) => {
  assert.ok(BASE.includes(from), `fixture contains ${from}`);
  return BASE.replace(from, to);
};

test('an inline template edit updates only that component', () => {
  assert.deepEqual(check(edit('<p>{{ count }}</p>', '<h2>{{ count }}</h2>')), ['Counter']);
});

test('an inline styles edit updates the component', () => {
  assert.deepEqual(check(edit('color: red', 'color: blue')), ['Counter']);
});

test('edits to two components in one file update both', () => {
  const updated = edit('<p>{{ count }}</p>', '<b>{{ count }}</b>').replace('<span>other</span>', '<i>other</i>');
  assert.deepEqual(check(updated), ['Counter', 'Other']);
});

test('adding or removing styles counts as a styles change', () => {
  assert.deepEqual(check(edit("  template: '<span>other</span>',\n", "  template: '<span>other</span>',\n  styles: 'span { color: red; }',\n")), ['Other']);
  assert.deepEqual(check(edit('  styles: `p { color: red; }`,\n', '')), ['Counter']);
});

test('changing template quotes is still a template change', () => {
  assert.deepEqual(check(edit("'<span>other</span>'", '`<span>other</span>`')), ['Other']);
});

test('comments above a component or at the end change nothing a component depends on', () => {
  assert.deepEqual(check(BASE + '// done\n'), []);
  // The CLI doesn't compare a component class's leading comments either.
  assert.deepEqual(check(edit('/** A counter. */', '/** The counter. */')), []);
});

for (const [what, from, to] of [
  ['a method', 'this.count++;', 'this.count += 2;'],
  ['a field initializer', 'count = 0;', 'count = 1;'],
  ['an input', "input('')", "input('x')"],
  ['imports', 'imports: [Icon],', 'imports: [],'],
  ['the selector', "'app-counter'", "'app-count'"],
  ['the order of other fields', "  selector: 'app-counter',\n  imports: [Icon],", "  imports: [Icon],\n  selector: 'app-counter',"],
  ['a new decorator field', "  selector: 'app-counter',\n", "  selector: 'app-counter',\n  host: {class: 'x'},\n"],
  ['a top-level constant', "'hi'", "'hello'"],
  ['an import', "import {Icon} from './icon';", "import {Icon} from './icon2';"],
  ['a comment above a constant', "const GREETING", "// Shown first.\nconst GREETING"],
  ['a plain class', 'export class Plain {}', 'export class Plain { x = 1; }'],
  ['the class name', 'export class Counter {', 'export class Counter2 {'],
  ['the export modifier', 'export class Other {}', 'class Other {}'],
  ['a heritage clause', 'export class Other {}', 'export class Other extends Plain {}'],
]) {
  test(`changing ${what} reloads`, () => {
    assert.equal(check(edit(from, to)), null);
  });
}

test('a template edit next to another change reloads', () => {
  assert.equal(check(edit('<p>{{ count }}</p>', '<h2>{{ count }}</h2>').replace('count = 0;', 'count = 1;')), null);
});

test('adding a statement reloads', () => {
  assert.equal(check(BASE + 'export const x = 1;\n'), null);
});

test('a template edit to a class the analyzer does not know as a component reloads', () => {
  assert.equal(hmrCandidates('/app/counter.ts', BASE, edit('<p>{{ count }}</p>', '<h2>{{ count }}</h2>'), () => false), null);
});

test('a shorthand or spread decorator field reloads', () => {
  const shorthand = BASE.replace("  selector: 'app-other',\n", "  selector,\n");
  assert.equal(check(shorthand.replace('<span>other</span>', '<i>other</i>'), shorthand), null);
});

test('ngp emits an update module for an inline template edit, and none for a selector edit', async () => {
  const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
  const playground = path.join(repo, 'playground');
  const tsconfig = path.join(playground, 'tsconfig.app.json');
  const file = path.join(playground, 'src/app/pages/components/rating.ts');
  const compiler = await NgpCompiler.create({
    toolchainDir: process.env.NGP_TOOLCHAIN ?? path.join(repo, 'toolchain/out'),
    engine: 'native',
    tsconfig,
    analyzerTsconfig: tsconfig,
    enableHmr: true,
  });
  try {
    const original = await fs.readFile(file, 'utf8');
    await compiler.transform(file, original);

    const templateEdit = original.replace('<app-icon name="star"', '<span class="hmr-marker"></span><app-icon name="star"');
    assert.notEqual(templateEdit, original);
    const {previous} = await compiler.update(file, templateEdit, 'watcher');
    assert.equal(previous, original);
    const updates = await compiler.inlineHmrUpdates(file, previous, templateEdit);
    assert.equal(updates?.length, 1);
    assert.equal(decodeURIComponent(updates[0].id), 'src/app/pages/components/rating.ts@Rating');
    assert.match(updates[0].code, /hmr-marker/);

    const stylesEdit = templateEdit.replace('color: #f5a524', 'color: #00ff7f');
    await compiler.update(file, stylesEdit, 'watcher');
    const styleUpdates = await compiler.inlineHmrUpdates(file, templateEdit, stylesEdit);
    assert.match(styleUpdates?.[0]?.code ?? '', /#00ff7f/);

    const selectorEdit = stylesEdit.replace("selector: 'app-rating'", "selector: 'app-stars'");
    await compiler.update(file, selectorEdit, 'watcher');
    assert.equal(await compiler.inlineHmrUpdates(file, stylesEdit, selectorEdit), null);
  } finally {
    compiler.close();
  }
});
