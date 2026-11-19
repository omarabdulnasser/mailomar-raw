---
title: Context Menu
description: Generate aliases from the browser context menu.
---

The context menu feature lets you generate a new email alias for any website with a single right-click — no need to open the extension popup.

## How It Works

1. Right-click on any web page
2. Select **"Generate and copy new MailFlare alias"** from the context menu
3. MailFlare generates a new alias using your saved settings and the current website's hostname
4. The alias is automatically copied to your clipboard
5. A notification overlay appears on the page confirming the alias was created

## Requirements

- You must be signed in to MailFlare (with a Cloudflare API token or to a Mailflare Worker)
- A domain must be selected in the extension
- Alias settings must be configured (destination email, format, etc.)
- The format cannot be "custom" — the context menu only works with auto-generated formats

## How the Alias is Generated

The context menu uses your saved alias generation settings:

- The **domain** from your selected zone
- The **format** (characters, words or the website's domain) and related settings
- The **prefix** setting — if set to a domain-based prefix, the current site's hostname is used
- The **destination** from your saved settings

The alias is created right away: as an Email Routing rule, or in your Mailflare Worker.

The menu entry appears on `https://` pages, where MailFlare can show the result and copy the
alias.
