// Component HMR in a real Vite dev server: what the plugin sends to the browser after an edit.
// A template-only edit updates in place. A template edited together with its component's class
// reloads once, with no update first (decision 22 in docs/decisions.md). Run `pnpm build` first;
// needs an ngp toolchain build.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import {after, before, test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {ngp} from '../dist/index.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../../..');
const toolchain = process.env.NGP_TOOLCHAIN ?? path.join(repo, 'toolchain/out');

/** Longer than the plugin's 50 ms batch window, with room for the analyzer. */
const SETTLE_MS = 400;

const COMPONENT = (field) => `import {Component, signal} from '@angular/core';

@Component({selector: 'app-root', templateUrl: './app.html'})
export class App {
  protected readonly ${field} = signal(1);
}
`;
const TEMPLATE = (field, text = 'Count') => `<p>${text}: {{ ${field}() }}</p>\n`;

let root;
let server;
/** Everything the plugin and Vite sent over the client's HMR channel. */
let sent = [];

before(async () => {
  // Inside the repo, so Angular resolves from the root node_modules.
  root = await fs.mkdtemp(path.join(here, '.hmr-'));
  await fs.mkdir(path.join(root, 'src'));
  await fs.writeFile(
    path.join(root, 'tsconfig.json'),
    JSON.stringify({
      compilerOptions: {strict: true, target: 'ES2022', module: 'preserve', experimentalDecorators: true, skipLibCheck: true},
      include: ['src/**/*.ts'],
    }),
  );
  await fs.writeFile(
    path.join(root, 'src/main.ts'),
    "import {bootstrapApplication} from '@angular/platform-browser';\nimport {App} from './app';\n\nbootstrapApplication(App);\n",
  );
  await fs.writeFile(path.join(root, 'src/app.ts'), COMPONENT('count'));
  await fs.writeFile(path.join(root, 'src/app.html'), TEMPLATE('count'));

  server = await createServer({
    root,
    configFile: false,
    logLevel: 'silent',
    plugins: [ngp({toolchain})],
    server: {middlewareMode: true, ws: false},
  });
  // Edits made before the watcher has seen the files would go unreported.
  await until(() => server.watcher.getWatched()[path.join(root, 'src')]?.includes('app.html'));
  const hot = server.environments.client.hot;
  const send = hot.send.bind(hot);
  hot.send = (payload, ...rest) => {
    sent.push(payload);
    return send(payload, ...rest);
  };
  // Puts the component in the client's module graph, as a page load would.
  await server.environments.client.transformRequest('/src/app.ts');
});

after(async () => {
  await server?.close();
  if (root) {
    await fs.rm(root, {recursive: true, force: true});
  }
});

const updates = () => sent.filter((p) => p.type === 'custom' && p.event === 'angular:component-update');
const reloads = () => sent.filter((p) => p.type === 'full-reload');

async function until(condition) {
  const deadline = Date.now() + 10_000;
  while (!condition() && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

/** Waits for `condition`, then long enough for anything else the edit would send. */
async function settle(condition) {
  await until(condition);
  await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));
}

async function write(file, content) {
  await fs.writeFile(path.join(root, 'src', file), content);
}

test('a template-only edit updates the component in place', async () => {
  sent = [];
  await write('app.html', TEMPLATE('count', 'Total'));
  await settle(() => updates().length > 0);
  assert.deepEqual(updates().map((p) => decodeURIComponent(p.data.id)), ['src/app.ts@App']);
  assert.equal(reloads().length, 0);
});

test('a template written just before its class reloads once, with no update', async () => {
  sent = [];
  await write('app.html', TEMPLATE('total'));
  await write('app.ts', COMPONENT('total'));
  await settle(() => reloads().length > 0);
  assert.equal(updates().length, 0);
  assert.equal(reloads().length, 1);
});

test('a template written just after its class reloads once, with no update', async () => {
  // The page reloaded in the previous test, so the component is back in the module graph.
  await server.environments.client.transformRequest('/src/app.ts');
  sent = [];
  await write('app.ts', COMPONENT('count'));
  await write('app.html', TEMPLATE('count'));
  await settle(() => reloads().length > 0);
  assert.equal(updates().length, 0);
  assert.equal(reloads().length, 1);
});
