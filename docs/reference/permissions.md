---
title: Permissions
description: What permissions the MailFlare extension requires and why.
---

The MailFlare browser extension requests the following permissions:

## Required Permissions

### `storage`

Stores your token, settings, alias preferences, and cached data locally in the browser.

### `contextMenus`

Adds "Generate and copy new MailFlare alias" to the right-click menu.

### `clipboardWrite`

Copies new aliases to your clipboard, from the popup and the context menu.

### `activeTab`

Reads the current website's address, for domain-based aliases and descriptions.

### `scripting`

When you use the context menu in a tab that was open before MailFlare was installed or updated, the
content script isn't running there yet. MailFlare starts it in that tab (only after your click),
so it can show the result and copy the alias.

### `identity`

Signs you in to an account on a [Mailflare Worker](../guides/worker-mode.md): the Worker's sign-in
page opens in a browser window and hands the extension a session when you allow it.

## Host Permissions

### `https://api.cloudflare.com/*`

With a Cloudflare API token, the extension talks to the Cloudflare API directly. If you withdraw
this access, MailFlare shows a banner with an **Allow access** button. A Mailflare Worker doesn't
need it.

## Content Script

On `https://` pages, MailFlare adds the optional quick-create button to email fields and shows the
notifications of the context menu.

## What MailFlare Does NOT Do

- Does **not** collect or send analytics or telemetry
- Does **not** access your browsing history
- Does **not** change web pages, except for the optional quick-create button and notifications
- Does **not** send your token anywhere except to Cloudflare's API or your own Mailflare Worker
