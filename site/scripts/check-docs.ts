// Fails when the docs site has drifted from the code. Run by `pnpm docs:check` and `pnpm test`.
//
// It checks that:
//   - every option in the plugin's NgpPluginOptions has a row in content/configuration.md;
//   - every page in content/ is in DOCS in src/app/docs.ts, and every DOCS entry has a page;
//   - every page has a title and a description in its front matter;
//   - every link between pages, in the markdown and on the home page, points at a page and a
//     heading that exist.
//
// Usage: node site/scripts/check-docs.ts

import {readdir, readFile} from 'node:fs/promises';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {renderMarkdown} from './markdown.ts';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.dirname(site);
const problems: string[] = [];

// 1. Plugin options against the Configuration table.
const pluginSource = path.join(repo, 'packages/vite-plugin-ngp/src/index.ts');
const sourceFile = ts.createSourceFile(pluginSource, await readFile(pluginSource, 'utf8'), ts.ScriptTarget.Latest, true);
const options: string[] = [];
sourceFile.forEachChild((node) => {
  if (ts.isInterfaceDeclaration(node) && node.name.text === 'NgpPluginOptions') {
    for (const member of node.members) {
      if (member.name && ts.isIdentifier(member.name)) {
        options.push(member.name.text);
      }
    }
  }
});
if (options.length === 0) {
  problems.push(`couldn't find NgpPluginOptions in ${path.relative(repo, pluginSource)}`);
}
const configuration = await readFile(path.join(site, 'content/configuration.md'), 'utf8');
for (const option of options) {
  if (!new RegExp(`^\\| \`${option}\` \\|`, 'm').test(configuration)) {
    problems.push(`option \`${option}\` has no row in the Options table of site/content/configuration.md`);
  }
}

// 2. Pages against DOCS.
const docsSource = await readFile(path.join(site, 'src/app/docs.ts'), 'utf8');
const entries = [...docsSource.matchAll(/\{path: '([^']+)',[^\n]*?content\/([^']+)\.md'/g)].map((m) => ({path: m[1], file: m[2]}));
for (const entry of entries) {
  if (entry.path !== entry.file) {
    problems.push(`DOCS entry '${entry.path}' loads content/${entry.file}.md: keep the route and the file name the same`);
  }
}
const files = (await readdir(path.join(site, 'content'))).filter((f) => f.endsWith('.md') && !f.startsWith('_'));
for (const file of files) {
  if (!entries.some((e) => `${e.file}.md` === file)) {
    problems.push(`site/content/${file} isn't in DOCS in site/src/app/docs.ts, so the site doesn't show it`);
  }
}
for (const entry of entries) {
  if (!files.includes(`${entry.file}.md`)) {
    problems.push(`DOCS entry '${entry.path}' has no site/content/${entry.file}.md`);
  }
}

// 3. Front matter, and the ids each page's headings get.
const ids = new Map<string, Set<string>>();
const links: {from: string; href: string}[] = [];
for (const file of files) {
  const source = await readFile(path.join(site, 'content', file), 'utf8');
  const doc = await renderMarkdown(source);
  const page = file.replace(/\.md$/, '');
  if (!/^---\n[\s\S]*?\btitle:\s*\S/.test(source)) problems.push(`site/content/${file} has no title in its front matter`);
  if (!/^---\n[\s\S]*?\bdescription:\s*\S/.test(source)) problems.push(`site/content/${file} has no description in its front matter`);
  ids.set(page, new Set([...doc.html.matchAll(/ id="([^"]+)"/g)].map((m) => m[1])));
  for (const m of doc.html.matchAll(/<a href="([^"]+)"/g)) {
    links.push({from: `site/content/${file}`, href: m[1]});
  }
}

// 4. Links between pages: bare paths in markdown, routerLink (+ fragment) on the home page.
const home = await readFile(path.join(site, 'src/app/pages/home.html'), 'utf8');
for (const m of home.matchAll(/routerLink="\/([^"]*)"(?:\s+fragment="([^"]+)")?/g)) {
  links.push({from: 'site/src/app/pages/home.html', href: m[1] + (m[2] ? `#${m[2]}` : '')});
}
for (const {from, href} of links) {
  if (/^[a-z]+:/i.test(href) || href.startsWith('/') || href.startsWith('#')) {
    if (href.startsWith('#') || (href.startsWith('/') && !href.startsWith('//'))) {
      problems.push(`${from} links to '${href}': link to other pages by bare path, such as 'configuration#options'`);
    }
    continue;
  }
  const [page, fragment] = href.split('#');
  if (page === '') {
    continue; // the home page
  }
  if (!ids.has(page)) {
    problems.push(`${from} links to '${href}', but there's no page '${page}'`);
  } else if (fragment && !ids.get(page)!.has(fragment)) {
    problems.push(`${from} links to '${href}', but '${page}' has no heading with id '${fragment}'`);
  }
}

if (problems.length > 0) {
  console.error(`The docs site is out of step with the code (${problems.length}):\n`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error('\nCLAUDE.md says which page covers what. Fix the docs in the same commit as the change.');
  process.exit(1);
}
console.log(`docs check: ${options.length} options, ${entries.length} pages, ${links.length} links, all in step`);
