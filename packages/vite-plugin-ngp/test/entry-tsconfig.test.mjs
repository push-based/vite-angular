// The analyzer reads a generated tsconfig that lists only the entry points (decision 4 in
// docs/decisions.md). This checks that every playground module compiles to the same output with
// it as with the app's own tsconfig. Run `pnpm build` first; needs an ngp toolchain build.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {NgpCompiler} from '../dist/compiler.js';
import {writeEntryTsconfig} from '../dist/entry-tsconfig.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const playground = path.join(repo, 'playground');
const toolchainDir = process.env.NGP_TOOLCHAIN ?? path.join(repo, 'toolchain/out');

async function compileAll(analyzerTsconfig, files) {
  const tsconfig = path.join(playground, 'tsconfig.app.json');
  const compiler = await NgpCompiler.create({toolchainDir, engine: 'native', tsconfig, analyzerTsconfig, enableHmr: false});
  const out = new Map();
  try {
    for (const file of files) {
      const result = await compiler.transform(file, await fs.readFile(file, 'utf8'));
      out.set(file, result?.code ?? null);
    }
  } finally {
    compiler.close();
  }
  return out;
}

test('entry-only tsconfig compiles every playground module identically', async () => {
  const files = (await fs.readdir(path.join(playground, 'src'), {recursive: true}))
    .filter((f) => f.endsWith('.ts'))
    .map((f) => path.join(playground, 'src', f))
    .sort();
  const entryTsconfig = await writeEntryTsconfig({
    tsconfig: path.join(playground, 'tsconfig.app.json'),
    entries: [path.join(playground, 'src/main.ts')],
    outDir: await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-ngp-')),
  });

  const full = await compileAll(path.join(playground, 'tsconfig.app.json'), files);
  const entryOnly = await compileAll(entryTsconfig, files);

  for (const file of files) {
    if ((await fs.readFile(file, 'utf8')).includes('@Component(')) {
      assert.ok(full.get(file), `expected ngp to compile ${path.relative(playground, file)}`);
    }
  }
  for (const file of files) {
    assert.equal(entryOnly.get(file), full.get(file), path.relative(playground, file));
  }
});
