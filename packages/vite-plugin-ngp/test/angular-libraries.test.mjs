// findAngularLibraries decides which packages a server environment bundles (and links) instead of
// leaving them to Node. Checked against a fake node_modules.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';
import {findAngularLibraries, packagePattern} from '../dist/angular-libraries.js';

async function writePackage(dir, pkg) {
  await fs.mkdir(dir, {recursive: true});
  await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg));
}

test('finds Angular libraries, directly and through other Angular libraries', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngp-libs-'));
  const modules = path.join(root, 'node_modules');
  await writePackage(root, {
    dependencies: {'@angular/core': '*', '@ngrx/store': '*', 'ui-kit': '*', rxjs: '*', missing: '*'},
  });
  await writePackage(path.join(modules, '@angular/core'), {peerDependencies: {rxjs: '*'}});
  await writePackage(path.join(modules, '@ngrx/store'), {peerDependencies: {'@angular/core': '*'}});
  // Reached only through ui-kit, and installed under it, as npm does on a version conflict.
  await writePackage(path.join(modules, 'ui-kit'), {dependencies: {'@angular/core': '*', 'ui-icons': '*', tslib: '*'}});
  await writePackage(path.join(modules, 'ui-kit/node_modules/ui-icons'), {peerDependencies: {'@angular/core': '*'}});
  await writePackage(path.join(modules, 'rxjs'), {dependencies: {tslib: '*'}});
  await writePackage(path.join(modules, 'tslib'), {});

  assert.deepEqual(findAngularLibraries(root), ['@ngrx/store', 'ui-icons', 'ui-kit']);
});

test('packagePattern matches a package and its subpaths only', () => {
  const pattern = packagePattern('@ngrx/store');
  assert.ok(pattern.test('@ngrx/store'));
  assert.ok(pattern.test('@ngrx/store/testing'));
  assert.ok(!pattern.test('@ngrx/store-devtools'));
  assert.ok(!pattern.test('x@ngrx/store'));
});
