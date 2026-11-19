# Building the Mailflare extension from source

This archive is part of a pnpm monorepo: the extension (`apps/extension`) and the shared app it
renders (`packages/mailflare`, `@mailflare/core`).

Requirements: Node.js 22.12 or newer, and pnpm in the version from `packageManager` in
`package.json` (`corepack enable` provides it).

```sh
pnpm install
pnpm --filter @mailflare/extension zip:firefox
```

The Firefox build is written to `apps/extension/.output/firefox-mv3/`, and the ZIP to
`apps/extension/.output/mailflare-<version>-firefox.zip`.
