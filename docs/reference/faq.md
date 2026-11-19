---
title: FAQ
description: Frequently asked questions about MailFlare.
---

## General

### What is MailFlare?

MailFlare is an open-source browser extension and web app that lets you create and manage email
aliases using [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/). It's
similar to SimpleLogin or addy.io, but uses your own Cloudflare account, with no third-party
services.

### Is MailFlare free?

Yes. MailFlare is free and open source. Cloudflare Email Routing is free too, and so is a
[Mailflare Worker](../guides/worker-mode.md) within the Workers Free plan's daily limits. Replying
from aliases and accounts' inboxes need Cloudflare Email Sending (Workers Paid plan).

### Where is my data stored?

Your token and settings are stored locally in your browser (`localStorage` in the web app,
`chrome.storage.local` in the extension). Your aliases live in your Cloudflare account: as Email
Routing rules, or in your Mailflare Worker's database. Nothing goes to any other server.

### Should I use Email Routing rules or the Worker?

Rules need nothing but an API token. The Worker takes a few minutes to deploy and gives you
unlimited aliases, replies from your aliases, per-alias statistics, and optional accounts for other
people. See the comparison in [Worker Mode](../guides/worker-mode.md#why-use-it).

## Email Routing

### Do I need a paid Cloudflare plan?

No. Email Routing and the Worker run on the free plan. Only sending mail to arbitrary addresses
(replies, and accounts' inboxes) needs the Workers Paid plan.

### How many aliases can I create?

With Email Routing rules, up to **200 rules** per domain. With a Mailflare Worker, there is no
practical limit.

### Can I reply from my alias address?

With a [Mailflare Worker](../guides/worker-mode.md), yes: mail arrives from addresses like
`alias+bob=shop.com@your.domain`, and replying to them sends your message from the alias. With
Email Routing rules, Cloudflare only forwards incoming mail; you'd need to set up "Send mail as"
with an SMTP relay in your mail client.

### What happens if I delete an alias?

Mail to it is no longer forwarded. With Email Routing rules, it then goes to your catch-all rule if
you have one; a Worker rejects it.

## Troubleshooting

### My token verification fails

Make sure your API token has all required permissions:

- Account → Email Routing Addresses → Read
- Zone → Email Routing Rules → Edit
- Zone → Zone → Read
- Zone → Zone Settings → Read

See [API Token Setup](../guides/api-token.md) for full instructions.

### I don't see any domains

With an API token, check that:

1. Your API token has Zone → Read permission
2. Your Cloudflare account has at least one domain
3. Email Routing is enabled on the domain

With a Mailflare Worker, add your domains in the Worker's app under **Admin** → **Domains**. With
an account, the Worker's admin has to share a domain with accounts.

### The web app shows a loading error

With an API token, the web app goes through a proxy on Cloudflare Pages. Check your internet
connection and your token.

### The extension says it can't reach Cloudflare

You (or Firefox, at install) withdrew the extension's access to `api.cloudflare.com`. Click
**Allow access** in the banner, or allow it in your browser's extension settings.

### Context menu isn't working

Make sure:

1. You're signed in to the extension
2. A domain is selected
3. Your alias format is not set to "Custom" (the context menu only works with generated formats)
4. You have a destination saved in your alias settings
5. The page is an `https://` page
