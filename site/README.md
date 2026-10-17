# Docs site

The public docs for vite-plugin-ngp, at https://push-based.github.io/vite-angular/. It's an Angular app compiled by the plugin itself, rendered to static HTML with Angular SSR, and hydrated in the browser. The look comes from the PushBased design system in `src/styles/tokens.css` and `src/styles/components.css`.

| Path | What it is |
|---|---|
| `content/*.md` | The pages. `scripts/markdown.ts` compiles them to HTML at build time, with Shiki for code |
| `src/app/docs.ts` | The list of pages: their order, sidebar section, route and file |
| `src/app/pages/` | The home page, the docs page layout and the 404 page |
| `src/main.server.ts` | The server entry: `render(url, document)` and the routes to prerender |
| `scripts/prerender.mjs` | Renders every route from the server bundle into `dist/client`, and writes `404.html`, `sitemap.xml`, `robots.txt`, `llms.txt` and each page's markdown next to it |
| `scripts/search-index.mjs` | Builds the search index with [Pagefind](https://pagefind.app) from the prerendered pages, into `dist/client/pagefind`. Only each page's article (`data-pagefind-body`) is indexed |
| `src/app/search/` | The search dialog. The app imports it on the first ⌘K or click, and it loads Pagefind when it opens |
| `scripts/check-docs.ts` | `pnpm docs:check`: fails when the Configuration table, the sidebar, a page's front matter or a link between pages has drifted from the code |
| `scripts/logo.mjs` | Generates `public/logo.svg` |

## Work on it

From the repo root, after `pnpm toolchain`:

```bash
pnpm site:dev
```

Vite serves it at http://localhost:5173/vite-angular/, rendered on the server. To build what GitHub Pages serves:

```bash
pnpm site:build
```

The result is in `site/dist/client`. `pnpm --filter site preview` serves it. Search only works there: `pnpm site:dev` doesn't build the index, and the dialog says so.

## Add a page

1. Write `content/<name>.md`, with `title` and `description` in its front matter.
2. Add it to `DOCS` in `src/app/docs.ts`.

That adds it to the router, the sidebar and the prerender list. Link to other pages with their bare path, such as `[Configuration](configuration)`. The page renders those as router links.

## Publish

Push to `main`. The [pages workflow](../.github/workflows/pages.yml) builds ngp, the plugin and the site, and deploys `site/dist/client`.
