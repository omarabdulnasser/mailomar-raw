# Mailflare

Mailflare turns [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) into
your own email alias service, similar to SimpleLogin or addy.io, without third-party services or a
mail server of your own.

- **Browser extension** (Chrome, Edge, Firefox and other browsers): create an alias for the site
  you're on from the popup, the context menu or a button inside email fields.
- **Web app** (installable as a PWA): the same alias management on any device.
- **Two ways to store aliases:**
    - **Email Routing rules** (default): each alias is a rule in your Cloudflare account, managed
      with an API token. Nothing to deploy.
    - **Mailflare Worker**: a Worker on your Cloudflare account receives all mail for your domains.
      No 200-alias limit, replies from the alias, statistics, and optional accounts for other
      people. The Worker serves its own copy of the web app.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Curetix/mailflare)

The button deploys the Mailflare Worker; see the [Worker guide](docs/guides/worker-mode.md).

## Documentation

The user documentation is in [`docs/`](docs/README.md): installation, the API token, the Worker,
self-hosting the web app, and the features.

## Development

Requirements: Node.js 22.12 or newer and [pnpm](https://pnpm.io) (the version in
`package.json`'s `packageManager`; `corepack enable` picks it up).

```sh
pnpm install        # also installs the git hooks (lefthook)
pnpm dev:web        # the web app, http://localhost:5173
```

| Command            | What it does                                                       |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm dev`         | Every app in development mode                                      |
| `pnpm dev:web`     | Only the web app                                                   |
| `pnpm build`       | Builds every app and package                                       |
| `pnpm check-types` | TypeScript in every app and package                                |
| `pnpm test`        | The tests (the Worker's, in workerd)                               |
| `pnpm check`       | Oxlint, then Oxfmt                                                 |
| `pnpm run deploy`  | Builds and deploys the Worker with its app (see the Worker README) |

Each app has its own scripts, for example `pnpm --filter @mailflare/extension dev`. The
pre-commit hook formats staged files with Oxfmt. In a clone that used husky before, run
`pnpm exec lefthook install --reset-hooks-path` once.

### Project structure

```
apps/
  extension/   Browser extension (WXT); the popup renders the shared app
  web/         Web app / PWA (Vite), with a Cloudflare API proxy (Pages Functions)
  worker/      Mailflare Worker: mail handling, alias API, accounts (Hono, D1, Drizzle, better-auth)
  landing/     Landing page (Vinext, static export)
packages/
  mailflare/   @mailflare/core: the app's UI (Astryx), API clients, stores
  config/      Shared TypeScript configuration
docs/          User documentation (Markdown)
```

The repository root also holds a copy of the Worker's Wrangler config (`wrangler.jsonc`), so the
Deploy to Cloudflare button can deploy from the root; `pnpm check-types` checks that the two
match.

- [Extension](apps/extension/README.md)
- [Worker](apps/worker/README.md)
- [Releasing](RELEASING.md): versions, the release PR, store uploads and web deploys

## License

MIT, see [LICENSE](LICENSE).
