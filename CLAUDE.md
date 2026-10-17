# Working in this repo

vite-plugin-ngp compiles Angular per module in Vite with ngp. See [README.md](README.md) for the layout and [docs/building.md](docs/building.md) for the build.

## Keep the docs in step with the code

The public docs site at https://push-based.github.io/vite-angular/ is built from [site/content](site/content). It redeploys on every push to `main`. A change isn't done until the docs say what the code now does.

When you add or change anything a user of the plugin would see, update the matching docs **in the same commit**, then push:

| You changed | Update |
|---|---|
| An option, its default, or something the plugin configures in Vite (`define`, `optimizeDeps`, `resolve`, environments, middleware) | `site/content/configuration.md` |
| How compiling, edits, HMR, linking or globals work | `site/content/how-it-works.md` |
| Server rendering, the `render` contract, building or serving | `site/content/server-rendering.md` |
| Component stylesheets: `styleUrl`, Sass, encapsulation, style HMR | `site/content/styles.md` |
| Type-checking: what it checks, where errors show, what it costs | `site/content/type-checking.md` |
| Running specs under Vitest | `site/content/testing.md` |
| i18n: marking, extraction, translation, per-locale builds | `site/content/i18n.md` |
| An `ng build` option: `fileReplacements`, `budgets`, `polyfills`, or what can't move | `site/content/migrating-from-ng-build.md` |
| A number measured with `bench/` on the generated apps | `site/content/performance.md`, and the figures: `node bench/charts.mjs` redraws `site/content/charts/` from the result files |
| A number measured with `bench/` on a real app, or how the real apps are set up | `site/content/benchmarks.md`, its figures (same command), and `bench/README.md` |
| What works, what doesn't, a new limit or a fixed one | `site/content/status.md` |
| Setup steps, required versions, the toolchain | `site/content/getting-started.md`, `site/content/building-ngp.md` |
| A number on the home page, or the home page's claims | `site/src/app/pages/home.ts` and `home.html` |
| Anything above that a user would notice | also a line in `site/content/changelog.md`, under today's date, linking to the page that documents it |
| A design choice | an entry in `docs/decisions.md`, and `docs/design.md` |

Then check the docs and the site, and push:

```bash
pnpm docs:check
```

```bash
pnpm site:build
```

`pnpm docs:check` (also part of `pnpm test`, and of CI) fails when a plugin option has no row in the Configuration table, when a page isn't in the sidebar or a sidebar entry has no page, when a page has no title or description, and when a link between pages points at a page or heading that doesn't exist. It can't tell whether what a page *says* is still true. That part is on you: reread the pages your change touches.

```bash
git push
```

The `pages` workflow deploys it. Check it went green with `gh run list --workflow pages --limit 1`. A new docs page is `site/content/<path>.md` (with `title` and `description` front matter) plus one entry in `DOCS` in [site/src/app/docs.ts](site/src/app/docs.ts), which adds it to the router, the sidebar and the prerender list. Put a feature's page in the `Features` section. Add your entry yourself; you don't need to ask anyone.

## Writing docs

Write docs in [Clarity](https://clarity.addy.ie/) style: for one reader you can picture, specific enough to be wrong, with a position and where it's weak. Don't publish numbers that weren't measured, and say where a number came from. The site and this repo are public; the bench repo is private: never publish machine paths, and keep links into private GitHub repos few and labeled as private. Keep every color, space and radius on the site to the PushBased tokens in `site/src/styles/tokens.css`.

## Commits

Commit each coherent change on its own, with its docs, and push. Several sessions may share this checkout: commit only your own paths (`git commit -- <paths>`), and never revert changes you didn't make.
