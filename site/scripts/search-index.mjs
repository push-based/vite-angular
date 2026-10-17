// Builds the search index with Pagefind (https://pagefind.app) from the prerendered pages in
// dist/client, into dist/client/pagefind. Run after scripts/prerender.mjs. The site loads
// pagefind/pagefind.js and the index only when someone opens search.
//
// Only each doc page's article is indexed: it carries data-pagefind-body (doc-page.html), so the
// home page, the 404 page, the header, the sidebar and the footer stay out of the results.

import {readdir, readFile, rm} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import * as pagefind from 'pagefind';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const client = path.join(site, 'dist/client');
const out = path.join(client, 'pagefind');

const started = performance.now();
const {index, errors} = await pagefind.createIndex({
  // The "#" link after every heading and each code block's "Copy" button.
  excludeSelectors: ['.heading-anchor', '[data-copy]'],
  forceLanguage: 'en',
});
if (!index) {
  throw new Error(`pagefind: ${errors.join('\n')}`);
}
const added = await index.addDirectory({path: client});
if (added.errors.length) {
  throw new Error(`pagefind: ${added.errors.join('\n')}`);
}
const written = await index.writeFiles({outputPath: out});
if (written.errors.length) {
  throw new Error(`pagefind: ${written.errors.join('\n')}`);
}
await pagefind.close();

// Pagefind also writes its own search UIs. The site has its own dialog (src/app/search), so drop
// them rather than deploy 400 kB nothing loads.
for (const file of await readdir(out)) {
  if (/^pagefind-(ui|modular-ui|component-ui|highlight)\./.test(file)) {
    await rm(path.join(out, file));
  }
}
// added.page_count counts every HTML file read; the entry file counts the pages in the index.
const {languages} = JSON.parse(await readFile(path.join(out, 'pagefind-entry.json'), 'utf8'));
const pages = Object.values(languages).reduce((sum, l) => sum + l.page_count, 0);
console.log(`indexed ${pages} pages for search → dist/client/pagefind (${Math.round(performance.now() - started)} ms)`);
