// i18n: build-time translation, extraction, and the playground's German build (docs/i18n in
// design.md). Run `pnpm build` first; the last two tests need an ngp toolchain build.

import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {ɵmakeParsedTranslation as makeParsedTranslation} from '@angular/localize';
import {createBuilder} from 'vite';
import {extractMessages} from '../dist/extract.js';
import {localizeHtml, negotiateLocale, translateChunk} from '../dist/i18n.js';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const playground = path.join(repo, 'playground');
process.env.NGP_TOOLCHAIN ??= path.join(repo, 'toolchain/out');

test('translateChunk translates messages, inlines the locale, and adds locale data', async () => {
  const code = [
    '(globalThis.$localize ??= {}).locale = "___NG_LOCALE_INSERT___";',
    'export const greeting = (name) => $localize`:@@greeting:Hello ${name}:name:!`;',
    'export const missing = $localize`:@@missing:Not translated`;',
    'export const locale = typeof $localize !== "undefined" && $localize.locale;',
  ].join('\n');
  const result = await translateChunk(code, 'chunk.js', {code: 'de'}, {
    translations: {greeting: makeParsedTranslation(['Hallo ', '!'], ['name'])},
    missingTranslation: 'warning',
    localeData: 'globalThis.registered = "de";',
  });
  assert.match(result.code, /"Hallo " \+ name \+ "!"/);
  assert.match(result.code, /"Not translated"/);
  assert.match(result.code, /\.locale = "de";\s*globalThis\.registered = "de";/);
  assert.match(result.code, /export const locale = "de";/);
  assert.doesNotMatch(result.code, /\$localize`/);
  assert.deepEqual(
    result.diagnostics.map((d) => d.type),
    ['warning'],
  );
});

test('localizeHtml sets lang and base href', () => {
  assert.equal(
    localizeHtml('<html lang="en">\n  <head>\n    <title>x</title>', 'de', '/de/'),
    '<html lang="de">\n  <head>\n    <base href="/de/">\n    <title>x</title>',
  );
  assert.equal(localizeHtml('<html><head><base href="/"></head>', 'fr', '/app/fr/'), '<html lang="fr"><head><base href="/app/fr/"></head>');
});

test('negotiateLocale picks the first built locale the browser accepts', () => {
  const locales = [{code: 'en-US'}, {code: 'de'}];
  assert.equal(negotiateLocale('de-CH,de;q=0.9,en;q=0.8', locales)?.code, 'de');
  assert.equal(negotiateLocale('fr;q=0.9,en-GB;q=0.8', locales)?.code, 'en-US');
  assert.equal(negotiateLocale('fr', locales), undefined);
});

test('vite build writes one translated folder per locale', async () => {
  const builder = await createBuilder({root: playground, logLevel: 'silent', build: {write: false}}, null);
  const [en, de] = await builder.build(builder.environments.client);
  const html = (output) => output.output.find((f) => f.fileName === 'index.html').source;
  const js = (output) => output.output.filter((f) => f.type === 'chunk').map((f) => f.code).join('\n');

  assert.match(html(en), /<html lang="en-US">/);
  assert.match(html(en), /<base href="\/en-US\/">/);
  assert.match(html(de), /<html lang="de">/);
  assert.match(html(de), /<base href="\/de\/">/);
  assert.match(js(en), /one module at a time/);
  assert.match(js(de), /ein Modul nach dem anderen/);
  // German locale data, inlined where the prelude sets the locale: month names, for DatePipe.
  assert.match(js(de), /[`"]Oktober[`"]/);
  assert.doesNotMatch(js(en), /[`"]Oktober[`"]/);
  for (const output of [en, de]) {
    assert.doesNotMatch(js(output), /\$localize`/);
  }
});

test('extractMessages writes the playground messages as XLIFF', async () => {
  const outFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'vite-plugin-ngp-')), 'messages.xlf');
  const {messages} = await extractMessages({root: playground, outFile});
  const xliff = await fs.readFile(outFile, 'utf8');
  assert.ok(messages > 20, `expected the playground's messages, got ${messages}`);
  assert.match(xliff, /source-language="en-US"/);
  assert.match(xliff, /<trans-unit id="overviewHeading"/);
  assert.match(xliff, /Skip to content/);
  // Extraction must not leave translated output behind it: same ids as the committed file.
  const committed = await fs.readFile(path.join(playground, 'src/locale/messages.xlf'), 'utf8');
  const ids = (s) => [...s.matchAll(/<trans-unit id="([^"]+)"/g)].map((m) => m[1]).sort();
  assert.deepEqual(ids(xliff), ids(committed));
});
