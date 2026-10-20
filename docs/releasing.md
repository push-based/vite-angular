# Releasing

This page is for whoever publishes vite-plugin-ngp to npm. It follows PushBased's publishing setup, the same one push-based/zod2nx-schema uses: Nx release picks the version from conventional commits, one GitHub workflow tags and creates the release, and a second publishes to npm without an npm token.

Only `packages/vite-plugin-ngp` is published. The playground, the site and the bench are private. The package doesn't contain ngp, so users still build it with `pnpm toolchain`.

## Commit messages

Releases are computed from commit messages, so every commit on `main` is a [conventional commit](https://www.conventionalcommits.org/):

```text
feat(vite-plugin-ngp): reload the page when angular.json changes
```

- **Types** are commitlint's conventional set (`feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `style`, `revert`), plus `release` for the commit Nx release makes.
- **Scopes** are optional. When you give one, it's a workspace project (`vite-plugin-ngp`, `playground`, `site`) or `bench`, `toolchain` or `workflows`.
- **The subject** is in the imperative present tense: "add", not "added" or "adds".

`feat` bumps the minor version and `fix` or `perf` bumps the patch. A `!` after the type, or a `BREAKING CHANGE:` footer, bumps the major version. Other types don't bump the version. While the version is 0.x, Nx shifts each bump down a level: a breaking change bumps the minor and a `feat` bumps the patch.

The commit-msg hook in `.husky` checks each commit locally. `pnpm install` installs it. On a pull request, the PR Commitlint workflow checks the title, because a squash merge turns the title into the commit on `main`. Commits made before 20 October 2026 aren't conventional, and Nx release skips them.

## Cutting a release

1. In the Actions tab, run **Release** on `main`. It computes the version from the commits since the last `v*` tag, updates `packages/vite-plugin-ngp/package.json` and `CHANGELOG.md`, commits `release: <version>`, tags `v<version>`, pushes both, and creates the GitHub release. If no commit since the last tag bumps the version, it does nothing.
2. The tag starts **Publish**, which builds the plugin and publishes it to npm with provenance. If the run fails, start Publish again by hand on the tag; a version already on npm is skipped.

To preview a release on CI, run **Release** with **Dry run** ticked. It prints the version and changelog it would make and pushes nothing. It also checks that the bot's token can push to the repo, so it's the way to test `GH_APP_ID` and `GH_APP_PRIVATE_KEY` after setting them up. It doesn't test the bypass of `main`'s branch protection, because GitHub only checks that on a real push.

To preview a release locally without changing anything:

```bash
pnpm nx release --dry-run --skip-publish
```

`CHANGELOG.md` lists commits for each version. The site's [changelog](../site/content/changelog.md) stays the place that explains what changed for users, and still gets its line in the same commit as the change.

## One-time setup

| Step | Where | Who |
|---|---|---|
| Install the [PushBased Bot](https://github.com/apps/pushbased-bot) GitHub App (`pushbased-bot`) on the repo | Org settings → GitHub Apps → PushBased Bot → Configure → Repository access | Org owner |
| Create the `release` environment with variable `GH_APP_ID` = `2781189` and secret `GH_APP_PRIVATE_KEY` | Repo settings → Environments | Repo admin; the key comes from an EM |
| Protect `main`: require a pull request, and let `pushbased-bot` bypass it so Release can push | Repo settings → Branches | Repo admin |
| Publish the first version by hand (below) | A maintainer's machine | Someone in the push-based npm org |
| Add the trusted publisher: GitHub Actions, `push-based` / `vite-plugin-ngp`, workflow `publish.yml`, environment `release` | npmjs.com → package settings | Same person |

The first version has to be published by hand, because npm only lets you add a trusted publisher to a package that already exists:

```bash
pnpm nx release 0.1.0 --first-release --skip-publish
```

```bash
npm login
```

```bash
pnpm nx release publish --first-release
```

The first command needs `GH_TOKEN` set, or `gh` logged in, to create the GitHub release. After the trusted publisher is saved, set the package's publishing access on npmjs.com to require two-factor authentication and disallow tokens, so only the workflow can publish.

Renaming `publish.yml` or the `release` environment breaks publishing until the npm settings are changed to match.
