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
| What works, what doesn't, a new limit or a fixed one | `site/content/status.md` |
| Setup steps, required versions, the toolchain | `site/content/getting-started.md`, `site/content/building-ngp.md` |
| A number on the home page, or the home page's claims | `site/src/app/pages/home.ts` and `home.html` |
| A design choice | an entry in `docs/decisions.md`, and `docs/design.md` |

Then check the site builds and push:

```bash
pnpm site:build
```

```bash
git push
```

The `pages` workflow deploys it. Check it went green with `gh run list --workflow pages --limit 1`. A new docs page goes in [site/src/app/docs.ts](site/src/app/docs.ts), which adds it to the router, the sidebar and the prerender list.

## Writing docs

Write docs in [Clarity](https://clarity.addy.ie/) style: for one reader you can picture, specific enough to be wrong, with a position and where it's weak. Don't publish numbers that weren't measured, and say where a number came from. Keep every color, space and radius on the site to the PushBased tokens in `site/src/styles/tokens.css`.

## Commits

Commit each coherent change on its own, with its docs, and push. Several sessions may share this checkout: commit only your own paths (`git commit -- <paths>`), and never revert changes you didn't make.
