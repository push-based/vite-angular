---
title: Testing with Vitest
description: Run Angular component and service specs with TestBed under Vitest, compiled AOT by vite-plugin-ngp, one spec and its imports at a time.
---

# Testing with Vitest

vite-plugin-ngp runs your Angular specs under Vitest with TestBed. It compiles them ahead of time with ngp, the same way it compiles your app in the dev server. A run compiles only the specs you asked for and what they import: run one spec, and ngp compiles that spec's components, not the whole app. Setup is the plugin in `vitest.config.ts` plus one setup file.

This page is for someone who already builds an app with the plugin and wants to test it. It covers the setup, what the plugin changes when Vitest runs it, and what hasn't been tried yet.

## Setup

Install Vitest and a DOM. The repo's playground uses these versions:

```bash
pnpm add -D vitest@5.0.4 jsdom@30.1.2
```

`vitest.config.ts`, next to your `vite.config.ts`:

```ts
import {defineConfig} from 'vitest/config';
import {ngp} from '@push-based/vite-plugin-ngp';

export default defineConfig({
  plugins: [ngp()],
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
});
```

Pass `ngp()` the same `toolchain` option as in your Vite config, or set `NGP_TOOLCHAIN`. Leave out `ssr`: the plugin ignores it under Vitest anyway.

`src/test-setup.ts` starts TestBed once per test file, and resets it after every test:

```ts
import {getTestBed} from '@angular/core/testing';
import {BrowserTestingModule, platformBrowserTesting} from '@angular/platform-browser/testing';
import {afterEach} from 'vitest';

getTestBed().initTestEnvironment(BrowserTestingModule, platformBrowserTesting());

afterEach(() => getTestBed().resetTestingModule());
```

Don't skip the `afterEach`. Angular would register that reset itself, but only when `afterEach` is a global, and Vitest's globals are off by default. Without it, every test in a file shares one TestBed, and the second `configureTestingModule` fails with "the test module has already been instantiated".

TestBed runs zoneless, Angular's default, so there's no `zone.js` import. Wait for rendering with `await fixture.whenStable()`.

If you keep a `tsconfig.spec.json`, the plugin reads your Angular compiler options from it under Vitest, and from `tsconfig.app.json` otherwise. Add a script:

```json
"test": "vitest run"
```

## Writing specs

Specs are ordinary TestBed specs. A component with a signal input and a two-way `model()`, from the playground:

```ts
@Component({
  imports: [Rating],
  template: `<app-rating [(value)]="score" [max]="4" /><output>{{ score() }}</output>`,
})
class Host {
  readonly score = signal(2);
}

it('writes a click back to the parent through [(value)]', async () => {
  const fixture = TestBed.createComponent(Host);
  await fixture.whenStable();
  fixture.nativeElement.querySelectorAll('app-rating button')[3].click();
  await fixture.whenStable();
  expect(fixture.nativeElement.querySelector('output').textContent).toBe('4');
});
```

The host component is declared in the spec, and ngp compiles it ahead of time like any other component. A service spec needs nothing special: `TestBed.inject(ToastService)`, with `vi.useFakeTimers()` for its timeouts. Routed components work with `RouterTestingHarness` and your real routes, lazy `loadComponent` routes included:

```ts
TestBed.configureTestingModule({providers: [provideRouter(routes, withComponentInputBinding())]});
const harness = await RouterTestingHarness.create();
await harness.navigateByUrl('/router/signals');
```

TestBed overrides work too. `TestBed.overrideComponent(Rating, {set: {template: '...'}})` recompiles that one component with the JIT compiler, which `@angular/core/testing` always loads. ngp emits the class metadata that needs, in `ɵsetClassMetadata` calls, and they run because `ngDevMode` stays on in tests.

The playground's specs are in its `src/` folder, next to the files they test: a component spec, a service spec and a routed spec, 11 tests in all.

## What the plugin does under Vitest

The plugin knows Vitest is running from the `VITEST` environment variable, and changes five things from how it works in the dev server.

**Specs compile on demand.** In the dev server, ngp's analyzer starts from `src/main.ts`. Under Vitest it starts from nothing. Vitest asks for a spec, the plugin compiles it, and the analyzer follows that spec's imports. So a run filtered to one file compiles only that file's dependency tree. To see it, set `DEBUG=vite-plugin-ngp`:

```bash
DEBUG=vite-plugin-ngp pnpm vitest run src/app/pages/components/rating.spec.ts
```

```text
vite-plugin-ngp unchanged src/test-setup.ts (2.2 ms)
vite-plugin-ngp compiled src/app/pages/components/rating.spec.ts (20.3 ms)
vite-plugin-ngp compiled src/app/pages/components/rating.ts (15.4 ms)
vite-plugin-ngp compiled src/app/ui/icon.ts (2.5 ms)
```

That's 3 of the playground's 29 modules. All three specs together load 10. The repo has a test that checks the list for two filtered runs.

**Angular libraries get linked.** Vitest leaves `node_modules` to Node, which would load Angular's packages partially compiled, and they'd need the JIT compiler. The plugin adds every `@angular/*` package to `test.server.deps.inline`, plus every package in `dependencies` or `devDependencies` that depends on `@angular/core`. Vitest then sends them through Vite, where the linker runs. That also keeps one copy of `@angular/core`.

**Libraries are cached, your code isn't.** Vitest 5 caches transformed modules on disk, keyed by each file's own content. That's wrong for a component: its compiled code also depends on its template, its styles and the components it imports, so a template edit would come back stale. The plugin keeps your app's `.ts` files out of that cache. Linked libraries stay in it, and linking is the slow part. On an M2 Max, the playground's 11 tests take 2.1–2.5 s with an empty cache, and 1.1–1.3 s after that.

**No HMR, no SSR.** Compiled components carry no HMR code, and the `ssr` option is ignored. `ngDevMode` stays on, as in the dev server, and `ngJitMode` is `false`.

**Watch mode follows edits Angular cares about.** `vitest` without `run` reruns the specs that depend on what you saved. Edit a template, and the plugin tells Vitest its component changed, so that component's specs rerun with the new template. Edit a child component, and the parents that use it are compiled again too, so a renamed input fails the parent's spec with `NG8002: Can't bind to 'eyebrow'` instead of passing on stale code.

## Limits

- **Only jsdom has been tried.** happy-dom should work the same way. Vitest's browser mode and the `node` environment haven't been tried.
- **No `fakeAsync`.** It needs `zone.js`, and the setup above is zoneless. Use Vitest's fake timers and `await fixture.whenStable()` instead.
- **No type-checking.** Vitest strips types without checking them, as Vite does. Template errors ngp finds, like the `NG8002` above, do fail the spec file, but type errors elsewhere in a spec don't. Run `tsc` on your specs separately.
- **Your code is compiled again on every run.** Keeping app modules out of Vitest's cache is what makes the cache safe, and it costs time in proportion to what a run imports. In the playground that's 2–20 ms per module. On a large app, a full run pays it for every component.
- **Coverage hasn't been tried.** ngp returns source maps, so `@vitest/coverage-v8` should map back to your files, but nobody has checked.
