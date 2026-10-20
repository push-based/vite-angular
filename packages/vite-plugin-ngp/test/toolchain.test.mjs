// Which ngp build and native engine the plugin loads: the `toolchain` option, NGP_TOOLCHAIN, or
// the build bundled in the published package (decision 60 in docs/decisions.md). Run `pnpm build`
// first; needs no ngp build.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';
import {BUNDLED_TOOLCHAIN, nativeBindingPath, resolveToolchain} from '../dist/ngp-api.js';

async function layout(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'ngp-toolchain-'));
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(dir, file)), {recursive: true});
    await fs.writeFile(path.join(dir, file), '');
  }
  return dir;
}

test('the option wins over NGP_TOOLCHAIN, which wins over the bundled build', () => {
  assert.equal(resolveToolchain('/opt/a', {NGP_TOOLCHAIN: '/opt/b'}), '/opt/a');
  assert.equal(resolveToolchain(undefined, {NGP_TOOLCHAIN: '/opt/b'}), '/opt/b');
});

test('without either, the bundled build if the package has one, else an error naming both', async () => {
  const bundled = await fs.stat(BUNDLED_TOOLCHAIN).then(() => true, () => false);
  if (bundled) {
    assert.equal(resolveToolchain(undefined, {}), BUNDLED_TOOLCHAIN);
  } else {
    assert.throws(() => resolveToolchain(undefined, {}), /set the `toolchain` option or NGP_TOOLCHAIN/);
  }
});

test("the bundled layout's engine for this platform comes before a host build", async () => {
  const dir = await layout(['engines/native/linux-arm64/ng_analyze.node', 'engines/native/ng_analyze.node']);
  assert.equal(nativeBindingPath(dir, 'linux-arm64', false), path.join(dir, 'engines/native/linux-arm64/ng_analyze.node'));
  assert.equal(nativeBindingPath(dir, 'darwin-x64', false), path.join(dir, 'engines/native/ng_analyze.node'));
});

test('toolchain/out, with only the host engine, still loads', async () => {
  const dir = await layout(['engines/native/ng_analyze.node']);
  assert.equal(nativeBindingPath(dir, 'darwin-arm64', false), path.join(dir, 'engines/native/ng_analyze.node'));
});

test("musl skips the bundled glibc engines, and a platform with none says to use wasm", async () => {
  const dir = await layout(['engines/native/linux-x64/ng_analyze.node']);
  assert.throws(() => nativeBindingPath(dir, 'linux-x64', true), /no native ngp engine for linux-x64 \(musl\).*engine: 'wasm'/);
  assert.throws(() => nativeBindingPath(dir, 'win32-x64', false), /no native ngp engine for win32-x64/);
});
