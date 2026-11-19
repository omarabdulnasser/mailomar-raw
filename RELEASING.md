# Releasing

Mailflare has one version for the extension, the Worker and the web app: `v2.0.0`, `v2.1.0` and
so on, continuing the 1.x tags. [release-please](https://github.com/googleapis/release-please)
derives it from the [Conventional Commits](https://www.conventionalcommits.org) on `main`.

## How a release happens

1. Commits land on `main`. `feat:` makes the next release a minor one; `fix:`, `perf:`, `revert:`
   and `deps:` a patch; `feat!:` (or a `BREAKING CHANGE:` footer) a major one. `docs:`, `chore:`,
   `build:`, `ci:`, `refactor:`, `test:` and `style:` don't trigger a release and stay out of the
   changelog. Neither do commits that only touch `apps/landing`, `docs` or `.github`.
2. The **Release** workflow keeps a release PR open with the next version in every `package.json`
   that carries it and the new `CHANGELOG.md` section, rebuilt on top of `main` after every push
   (`always-update`), so its checks run against the latest code. Edit the PR to adjust the notes,
   right before merging it: the next push to `main` replaces them.
3. Merging the PR tags `vX.Y.Z` and creates the GitHub release with those notes. The workflow then
   builds the extension, attaches the Chrome, Firefox and sources ZIPs to the release, and submits
   them to the Chrome Web Store and Firefox Add-ons, where they go out once reviewed.

Worker self-hosters update by pulling the release and running `pnpm run deploy` (see the
[Worker guide](docs/guides/worker-mode.md)). It applies new database migrations before deploying
the new code (on a first deploy, after it, once the database exists), so migrations must keep
working with the previous release: add tables, columns with defaults and indexes; don't rename or
drop.

To force a version, add `"release-as": "X.Y.Z"` to the package in `release-please-config.json`,
and remove it again once that release is out.

### Sending a release to the stores again

If a store upload fails, run the **Release** workflow manually (Actions → Release → Run workflow)
with the tag, e.g. `v2.0.0`, and only the store that failed: a store that already has the version
refuses it again. With **dry run** checked, it only checks the store credentials.

## Web app and landing page

The **Deploy web** workflow builds and deploys both after **CI** passed for a push to `main`, as
Cloudflare Pages projects (it can also be run by hand on `main`):

| Site                                         | Project (default)   | Variable to override    |
| -------------------------------------------- | ------------------- | ----------------------- |
| Web app with its API proxy, app.mailflare.cc | `mailflare-app`     | `PAGES_APP_PROJECT`     |
| Landing page, mailflare.cc                   | `mailflare-landing` | `PAGES_LANDING_PROJECT` |

## Secrets and variables

Repository secrets (Settings → Secrets and variables → Actions):

| Secret                                | Used for                                                               |
| ------------------------------------- | ---------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`                | Deploying to Pages: a token with **Account → Cloudflare Pages → Edit** |
| `CLOUDFLARE_ACCOUNT_ID`               | The account of the Pages projects                                      |
| `CHROME_PUBLISHER_ID`                 | Chrome Web Store API v2: the publisher's ID                            |
| `CHROME_SERVICE_ACCOUNT_CLIENT_EMAIL` | Chrome Web Store API v2: a service account added to the publisher      |
| `CHROME_SERVICE_ACCOUNT_PRIVATE_KEY`  | Its private key, the PEM with real line breaks (not `                  |
| ` escapes)                            |
| `FIREFOX_JWT_ISSUER`                  | addons.mozilla.org API key ("JWT issuer")                              |
| `FIREFOX_JWT_SECRET`                  | Its secret                                                             |

`npx wxt submit init` (in `apps/extension`) walks through creating the store credentials. The
Chrome Web Store's old API v1.1 (OAuth client and refresh token) was shut down in October 2026; the
workflow uses API v2.

Repository variables, all optional:

| Variable                | Default                                  |
| ----------------------- | ---------------------------------------- |
| `CHROME_EXTENSION_ID`   | `aomfbgcabccoecaoimicmmkjdmdgcfpi`       |
| `FIREFOX_EXTENSION_ID`  | `{f0bdc9fa-a062-4424-baee-16530c53aa06}` |
| `FIREFOX_CHANNEL`       | `listed`                                 |
| `PAGES_APP_PROJECT`     | `mailflare-app`                          |
| `PAGES_LANDING_PROJECT` | `mailflare-landing`                      |

## One-time setup

- **GitHub:** Settings → Actions → General → allow GitHub Actions to create and approve pull
  requests (for the release PR). Pull requests opened by the workflow don't run CI on their own;
  push an empty commit to the release branch if you want checks on it.
- **Cloudflare Pages:** create the two projects for direct uploads, e.g.
  `npx wrangler pages project create mailflare-app --production-branch main`, then add the custom
  domains (app.mailflare.cc, mailflare.cc) to them. A project connected to Git can't take direct
  uploads, so move domains away from the old Git-connected `mailflare` project and turn off its
  builds (or delete it) once the new ones serve.
- **Secrets:** see above.
