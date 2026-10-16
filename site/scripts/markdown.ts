// Turns `content/*.md` into modules the site imports: `{title, description, html, headings,
// updated}`. Everything happens at build time, so neither marked nor Shiki ships to the browser.
//
// Beyond plain GitHub-flavored markdown it supports:
//   ```ts title="vite.config.ts"   a filename above a code block
//   > [!WARNING]                   a callout: NOTE, TIP, IMPORTANT, WARNING or CAUTION
// and gives every heading an id and a "#" link, and every code block a copy button.

import {execFileSync} from 'node:child_process';
import * as path from 'node:path';
import {Marked, type Token, type Tokens} from 'marked';
import {createHighlighter, type Highlighter} from 'shiki';
import type {Plugin} from 'vite';

export interface DocHeading {
  id: string;
  text: string;
  depth: number;
}

const LANGS = ['ts', 'js', 'bash', 'json', 'html', 'css', 'text'];
const CALLOUTS: Record<string, string> = {
  NOTE: 'Note',
  TIP: 'Tip',
  IMPORTANT: 'Important',
  WARNING: 'Warning',
  CAUTION: 'Caution',
};

let highlighter: Promise<Highlighter> | null = null;

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[`*_'’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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

/** The date of the last commit that touched `file`, as YYYY-MM-DD, or '' outside git. */
function lastUpdated(file: string | undefined): string {
  if (!file) {
    return '';
  }
  try {
    return execFileSync('git', ['log', '-1', '--format=%cs', '--', path.basename(file)], {
      cwd: path.dirname(file),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return '';
  }
}

/**
 * @param page the page's route, such as 'configuration', so heading links point at it. Links are
 *   relative to the site's base, like every other link between pages.
 * @param file the markdown file, for its last-updated date.
 */
export async function renderMarkdown(source: string, page = '', file?: string) {
  const {data, body} = frontMatter(source);
  const headings: DocHeading[] = [];
  const ids = new Map<Tokens.Heading, string>();
  const callouts = new Map<Tokens.Blockquote, string>();
  const used = new Set<string>();

  const marked = new Marked({
    gfm: true,
    renderer: {
      heading(token) {
        const id = ids.get(token as Tokens.Heading) ?? slugify(token.text);
        const inner = this.parser.parseInline(token.tokens);
        if (token.depth === 1) {
          return `<h1 id="${id}">${inner}</h1>\n`;
        }
        const label = escapeHtml(`Link to this section: ${token.text.replace(/[`*_]/g, '')}`);
        return `<h${token.depth} id="${id}">${inner}<a class="heading-anchor" href="${page}#${id}" aria-label="${label}">#</a></h${token.depth}>\n`;
      },
      link(token) {
        const inner = this.parser.parseInline(token.tokens);
        const external = /^https?:\/\//.test(token.href);
        const attrs = external ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${token.href}"${attrs}>${inner}</a>`;
      },
      blockquote(token) {
        const type = callouts.get(token as Tokens.Blockquote);
        const inner = this.parser.parse(token.tokens);
        if (!type) {
          return `<blockquote>\n${inner}</blockquote>\n`;
        }
        return `<aside class="callout callout--${type.toLowerCase()}" role="note"><p class="callout__label">${CALLOUTS[type]}</p>\n${inner}</aside>\n`;
      },
    },
  });

  const tokens = marked.lexer(body);
  const code: Tokens.Code[] = [];
  marked.walkTokens(tokens, (token: Token) => {
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
    } else if (token.type === 'blockquote') {
      // GitHub's callout syntax: the quote's first line is [!TYPE].
      const quote = token as Tokens.Blockquote;
      const first = quote.tokens[0];
      const match = first?.type === 'paragraph' ? /^\[!([A-Z]+)\]\s*\n?/.exec((first as Tokens.Paragraph).text) : null;
      if (match && CALLOUTS[match[1]]) {
        callouts.set(quote, match[1]);
        const paragraph = first as Tokens.Paragraph;
        const lead = paragraph.tokens[0];
        if (lead?.type === 'text') {
          const stripped = (lead as Tokens.Text).text.replace(/^\[![A-Z]+\]\s*\n?/, '');
          Object.assign(lead, {text: stripped, raw: stripped, tokens: undefined});
        }
        if (paragraph.tokens.length === 1 && (paragraph.tokens[0] as Tokens.Text).text === '') {
          quote.tokens.shift();
        }
      }
    }
  });

  highlighter ??= createHighlighter({themes: ['github-light', 'github-dark'], langs: LANGS});
  const shiki = await highlighter;
  for (const block of code) {
    // The info string: a language, then optional attributes such as title="vite.config.ts".
    const info = block.lang ?? '';
    const [word] = info.split(/\s+/);
    const lang = LANGS.includes(word) ? word : 'text';
    const title = /\btitle="([^"]+)"/.exec(info)?.[1];
    // Both themes: light colors inline, dark ones as --shiki-dark variables for site.css to switch to.
    const html = shiki.codeToHtml(block.text, {lang, themes: {light: 'github-light', dark: 'github-dark'}});
    const header = `<div class="code__header">${title ? `<span class="code__title">${escapeHtml(title)}</span>` : ''}<button type="button" class="code__copy" data-copy aria-label="Copy code${title ? ` from ${escapeHtml(title)}` : ''}">Copy</button></div>`;
    // marked prints an html token's text as it is.
    Object.assign(block, {
      type: 'html',
      block: true,
      pre: false,
      text: `<div class="code${title ? ' code--titled' : ''}" data-lang="${lang}">${header}${html}</div>`,
    });
  }

  return {
    title: data['title'] ?? headings[0]?.text ?? '',
    description: data['description'] ?? '',
    html: marked.parser(tokens),
    headings,
    updated: lastUpdated(file),
  };
}

export function markdown(): Plugin {
  return {
    name: 'site:markdown',
    enforce: 'pre',
    transform: {
      filter: {id: /\.md$/},
      async handler(source, id) {
        const file = id.replace(/[?#].*$/, '');
        const page = path.basename(file, '.md');
        const doc = await renderMarkdown(source, page.startsWith('_') ? '' : page, file);
        return {code: `export default ${JSON.stringify(doc)};`, map: null};
      },
    },
  };
}
