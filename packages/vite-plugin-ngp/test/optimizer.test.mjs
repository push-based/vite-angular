// The build optimizer rewrites Angular code so the bundler can drop what an app doesn't use
// (decision 24 in docs/decisions.md). These check each rewrite, and that Rolldown then drops an
// unused component. Run `pnpm build` first.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';
import {build} from 'vite';
import {isSideEffectFree, optimize} from '../dist/optimizer.js';

const APP_FILE = '/app/src/app/home.js';
const ANGULAR_FILE = '/app/node_modules/@angular/core/fesm2022/core.mjs';

const component = `import * as i0 from '@angular/core';
export class Home {
  static ɵfac = function Home_Factory(t) { return new (t || Home)(); };
  static ɵcmp = i0.ɵɵdefineComponent({type: Home, selectors: [['app-home']], decls: 0, vars: 0, template: function () {}});
}
(() => { (typeof ngDevMode === 'undefined' || ngDevMode) && i0.ɵsetClassMetadata(Home, [], null, null); })();
`;

test('wraps a class with Angular static members in a pure IIFE', () => {
  const {code} = optimize(component, APP_FILE, {sideEffectFree: false});
  assert.match(code, /export let Home = \/\*#__PURE__\*\/ \(\(\) => \{\nclass Home \{/);
  assert.match(code, /\nreturn Home;\n\}\)\(\);/);
});

test('turns ɵsetClassMetadata inside its wrapper into void 0', () => {
  const {code} = optimize(component, APP_FILE, {sideEffectFree: false});
  assert.match(code, /ngDevMode\) && void 0;/);
  assert.doesNotMatch(code, /ɵsetClassMetadata/);
});

test('leaves a class alone when a static member has side effects', () => {
  const code = `export class Store {\n  static ɵfac = () => new Store();\n  static instance = register(Store);\n}\n`;
  assert.equal(optimize(code, APP_FILE, {sideEffectFree: false}), null);
});

test('wraps static members assigned after the class, and removes JIT-only metadata', () => {
  const code = `class Svc {}\nSvc.ɵprov = i0.ɵɵdefineInjectable({token: Svc, factory: Svc.ɵfac});\nSvc.ctorParameters = () => [];\n`;
  const out = optimize(code, ANGULAR_FILE, {sideEffectFree: false}).code;
  assert.match(out, /^let Svc = \/\*#__PURE__\*\/ \(\(\) => \{\nclass Svc \{\}\nSvc\.ɵprov = /);
  assert.doesNotMatch(out, /ctorParameters/);
});

test('turns a TypeScript enum into a pure IIFE', () => {
  const code = `export var Color;\n(function (Color) {\n  Color[Color["Red"] = 0] = "Red";\n})(Color || (Color = {}));\n`;
  const out = optimize(code, APP_FILE, {sideEffectFree: false}).code;
  assert.match(out, /export var Color = \/\*#__PURE__\*\/ \(function \(Color\) \{[\s\S]*; return Color;\}\)\(Color \|\| \{\}\);/);
});

test('marks every top-level call pure in side-effect-free Angular packages only', () => {
  const code = `const ROUTES = makeToken('ROUTES');\nconst HOST = new Map();\nfunction f() { return g(); }\n`;
  const angular = optimize(code, ANGULAR_FILE, {sideEffectFree: true}).code;
  assert.match(angular, /ROUTES = \/\*#__PURE__\*\/ makeToken/);
  assert.match(angular, /HOST = \/\*#__PURE__\*\/ new Map/);
  assert.match(angular, /return g\(\)/);
  // Not side-effect free, or not Angular's: top-level code may run for its effects.
  assert.equal(optimize(code, ANGULAR_FILE, {sideEffectFree: false}), null);
  assert.equal(optimize(code, '/app/node_modules/other/index.js', {sideEffectFree: true}), null);
});

test('marks new InjectionToken pure everywhere, and never tslib helpers', () => {
  const code = `export const TOKEN = new InjectionToken('t');\n__decorate([x], C);\n`;
  assert.equal(optimize(code, APP_FILE, {sideEffectFree: false}).code, `export const TOKEN = /*#__PURE__*/ new InjectionToken('t');\n__decorate([x], C);\n`);
  assert.doesNotMatch(optimize(code, ANGULAR_FILE, {sideEffectFree: true}).code, /PURE__\*\/ __decorate/);
});

test('reads sideEffects from the nearest package.json', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ngp-side-effects-'));
  const write = async (dir, pkg) => {
    await fs.mkdir(dir, {recursive: true});
    await fs.writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg));
  };
  const modules = path.join(root, 'node_modules');
  await write(path.join(modules, 'pure'), {sideEffects: false});
  await write(path.join(modules, 'globs'), {sideEffects: ['**/global/*.js', '*.css']});
  await write(path.join(modules, 'plain'), {});

  assert.equal(isSideEffectFree(path.join(modules, 'pure/fesm2022/pure.mjs')), true);
  assert.equal(isSideEffectFree(path.join(modules, 'globs/fesm2022/globs.mjs')), true);
  assert.equal(isSideEffectFree(path.join(modules, 'globs/global/en.js')), false);
  assert.equal(isSideEffectFree(path.join(modules, 'globs/styles/a.css')), false);
  assert.equal(isSideEffectFree(path.join(modules, 'plain/index.js')), false);
  assert.equal(isSideEffectFree(path.join(root, 'src/app.js')), false);
});

test('lets Rolldown drop a component nothing uses', async () => {
  const modules = {
    entry: `import {Used} from 'lib';\nconsole.log(Used);\n`,
    lib: `import {ɵɵdefineComponent} from 'core';\n${['Used', 'Unused']
      .map((name) => `export class ${name} {\n  static ɵcmp = ɵɵdefineComponent({type: ${name}});\n}\n`)
      .join('')}`,
    core: `export function ɵɵdefineComponent(def) { globalThis.defined = (globalThis.defined ?? 0) + 1; return def; }\n`,
  };
  const bundle = async (optimized) => {
    const output = await build({
      configFile: false,
      logLevel: 'silent',
      plugins: [
        {
          name: 'modules',
          resolveId: (id) => (id in modules ? `\0${id}` : null),
          load: (id) => modules[id.slice(1)],
          transform: (code, id) => (optimized && id === '\0lib' ? optimize(code, APP_FILE, {sideEffectFree: false}) : null),
        },
      ],
      build: {write: false, minify: false, rolldownOptions: {input: 'entry'}},
    });
    return output[0]?.output[0].code ?? output.output[0].code;
  };
  assert.match(await bundle(false), /class Unused/);
  assert.doesNotMatch(await bundle(true), /Unused/);
});
