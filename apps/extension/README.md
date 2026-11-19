# Mailflare extension

The browser extension, built with [WXT](https://wxt.dev). The popup renders the shared app from
`@mailflare/core`; the rest is the extension's own:

| Entrypoint                 | Does                                                                         |
| -------------------------- | ---------------------------------------------------------------------------- |
| `popup/`                   | The app                                                                      |
| `import/`                  | Importing aliases from addy.io and SimpleLogin (opened from Settings)        |
| `background.ts`            | Context menu alias generation, Worker account sign-in (`identity`)           |
| `content.ts`               | The quick-create button in email fields and the in-page alerts (https pages) |
| `utils/migrate-storage.ts` | Converts data saved by 1.x (JSON strings) on the first start                 |

## Develop

```sh
pnpm dev            # Chrome, with reloading
pnpm dev:firefox    # Firefox
pnpm check-types
```

## Build

```sh
pnpm build          # .output/chrome-mv3
pnpm build:firefox  # .output/firefox-mv3
pnpm zip            # .output/mailflare-<version>-chrome.zip
pnpm zip:firefox    # …-firefox.zip, and …-sources.zip for Firefox's review
```

The sources ZIP holds what Firefox reviewers need to rebuild the extension: the extension, the
shared packages and the workspace files, with build steps in `SOURCE_CODE_REVIEW.md`. Releases are
built and submitted by CI, see [RELEASING.md](../../RELEASING.md).

Both browsers get Manifest V3. Firefox builds keep the add-on ID 1.x was published under
(`wxt.config.ts`), so existing installations update. The version comes from `package.json`.
