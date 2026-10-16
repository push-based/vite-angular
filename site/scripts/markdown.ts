// Turns `content/*.md` into modules the site imports: `{title, description, html, headings}`.
// Everything happens at build time, so neither marked nor Shiki ships to the browser.

import {Marked, type Tokens} from 'marked';
import {createHighlighter, type Highlighter} from 'shiki';
import type {Plugin} from 'vite';

export interface DocHeading {
  id: string;
  text: string;
  depth: number;
}

const LANGS = ['ts', 'js', 'bash', 'json', 'html', 'css', 'text'];

let highlighter: Promise<Highlighter> | null = null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function frontMatter(source: string): {data: Record<string, string>; body: string} {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (!match) {
    return {data: {}, body: source};
  }
  const data: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) {
      data[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
  }
  return {data, body: source.slice(match[0].length)};
}

export async function renderMarkdown(source: string) {
  const {data, body} = frontMatter(source);
  const headings: DocHeading[] = [];
  const ids = new Map<Tokens.Heading, string>();
  const used = new Set<string>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const id = ids.get(token as Tokens.Heading) ?? slugify(token.text);
        const inner = this.parser.parseInline(token.tokens);
        return `<h${token.depth} id="${id}">${inner}</h${token.depth}>\n`;
      },
      link(token) {
        const inner = this.parser.parseInline(token.tokens);
        const external = /^https?:\/\//.test(token.href);
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${token.href}"${attrs}>${inner}</a>`;
      },
    },
  });

  const tokens = marked.lexer(body);
  const code: Tokens.Code[] = [];
  marked.walkTokens(tokens, (token) => {
    if (token.type === 'heading') {
      const heading = token as Tokens.Heading;
      let id = slugify(heading.text);
      for (let n = 2; used.has(id); n++) id = `${slugify(heading.text)}-${n}`;
      used.add(id);
      ids.set(heading, id);
      if (heading.depth === 2 || heading.depth === 3) {
        headings.push({id, text: heading.text.replace(/[`*_]/g, ''), depth: heading.depth});
      }
    } else if (token.type === 'code') {
      code.push(token as Tokens.Code);
    }
  });

  highlighter ??= createHighlighter({themes: ['github-light', 'github-dark'], langs: LANGS});
  const shiki = await highlighter;
  for (const block of code) {
    const lang = LANGS.includes(block.lang ?? '') ? block.lang! : 'text';
    // Both themes: light colors inline, dark ones as --shiki-dark variables for site.css to switch to.
    const html = shiki.codeToHtml(block.text, {lang, themes: {light: 'github-light', dark: 'github-dark'}});
    // marked prints an html token's text as it is.
    Object.assign(block, {type: 'html', block: true, pre: false, text: `<div class="code" data-lang="${lang}">${html}</div>`});
  }

  return {
    title: data['title'] ?? headings[0]?.text ?? '',
    description: data['description'] ?? '',
    html: marked.parser(tokens),
    headings,
  };
}

export function markdown(): Plugin {
  return {
    name: 'site:markdown',
    enforce: 'pre',
    transform: {
      filter: {id: /\.md$/},
      async handler(source) {
        const doc = await renderMarkdown(source);
        return {code: `export default ${JSON.stringify(doc)};`, map: null};
      },
    },
  };
}
