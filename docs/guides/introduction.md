---
title: Introduction
description: What is MailFlare and how does it work?
---

MailFlare is a browser extension and web app that turns
[Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) into your own private
email alias service, similar to SimpleLogin and addy.io, but without third-party services or a
mail server of your own.

## How it works

Cloudflare Email Routing receives the mail for your domain and forwards it to your real inbox.
MailFlare creates and manages the addresses (aliases) it forwards, right from your browser.

When you create an alias like `github_abc1@yourdomain.com`, mail sent to it is forwarded to your
real address. With a separate alias for every website, you can tell which one shared your address,
and turn off an alias that gets spam.

MailFlare can keep your aliases in two places:

- **Email Routing rules** (the default): each alias is a rule in your Cloudflare account. You only
  need a Cloudflare API token. Cloudflare allows up to 200 rules per domain.
- **The Mailflare Worker**: you deploy a Worker to your Cloudflare account that receives all mail
  for your domains and keeps the aliases in its own database. There is no 200-alias limit, you can
  reply from your aliases, you see what each alias received, and you can give other people
  accounts. See [Worker Mode](worker-mode.md).

## Key Features

- **Browser extension** for Chrome, Edge, Firefox, and other Chromium-based browsers
- **Web app** that works on any device, installable as a PWA, with a sidebar layout on large
  screens
- **Generate aliases** from random characters, random words, the website's domain, or your own text
- **Context menu**: right-click to create and copy an alias for the current site
- **Quick-create button** inside email fields on websites
- **Bulk operations**: edit or delete several aliases at once
- **Multiple domains**: manage aliases across all your domains
- **Import** aliases from addy.io and SimpleLogin

## Prerequisites

- A [Cloudflare](https://cloudflare.com) account
- At least one domain with [Email Routing](https://developers.cloudflare.com/email-routing/)
  enabled
- A verified destination address in Cloudflare Email Routing (or, with the Worker, an account on a
  Worker someone shares with you)
