---
title: Settings
description: Configure MailFlare to your preferences.
---

Open **Settings** from the tab bar at the bottom (extension and phones) or the sidebar (large
screens). Some settings only appear where they apply.

## Theme

Switch between **Light**, **Dark**, and **Auto** (follows your system).

## Language

MailFlare is in English for now; more languages will follow.

## Rule Filter

Email Routing rules only. When enabled, only rules created by MailFlare are shown (their names
start with `mailflare:`). Turn it off to also see rules created elsewhere, marked **External**.

## Copy Alias

When enabled, new aliases are copied to your clipboard right after they're created.

## Quick-Create Button (extension only)

When enabled, a small button appears inside email fields on websites. Clicking it creates an alias
for the site and fills it in.

## Domains, Inboxes and Account (Mailflare Worker)

When the extension or another copy of the web app is connected to a
[Mailflare Worker](../guides/worker-mode.md), this opens the Worker's own app, where you manage
domains, inboxes and your account. In the Worker's app, these are pages of their own; on phones,
admins find **Domains** and **Accounts** under **Admin** here.

## Refresh Data

Reloads your domains and destination addresses. Useful after changes in the Cloudflare dashboard.

## Logout

Signs out and removes your token, the cached aliases and domains, and the alias defaults (which
name your domains and inboxes) from this device. App settings such as the theme stay. Your aliases
keep working.

## Import Aliases

Imports your aliases from addy.io or SimpleLogin: pick the service, preview the aliases, choose the
destination, and MailFlare creates them one by one. They keep their addresses, so only aliases on
your domains (including Email Routing subdomains) can be imported. In the extension the import
opens in a tab; in the web app it is a page of its own.
