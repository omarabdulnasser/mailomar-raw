---
title: Installation
description: How to install the MailFlare browser extension or use the web app.
---

## Browser Extension

### Chrome / Edge / Brave / Opera

Install the extension from the [Chrome Web Store](https://chromewebstore.google.com/detail/mailflare-email-alias-ext/aomfbgcabccoecaoimicmmkjdmdgcfpi).

All Chromium-based browsers can install extensions from the Chrome Web Store.

### Firefox

Install the extension from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/mailflare/). It updates itself from there.

If you installed MailFlare 1.x from a `.xpi` file on GitHub, it doesn't update on its own: install
it once from Firefox Add-ons, and your token and settings carry over.

## Web App

The MailFlare web app is available at [app.mailflare.cc](https://app.mailflare.cc). It works on any device with a modern browser and can be installed as a Progressive Web App (PWA).

### Installing as a PWA

1. Navigate to [app.mailflare.cc](https://app.mailflare.cc)
2. In Chrome/Edge: click the install icon in the address bar
3. In Safari (iOS): tap Share → "Add to Home Screen"
4. The app will be added to your home screen/desktop and work offline

A [Mailflare Worker](worker-mode.md) serves its own copy of the web app at its URL, connected to
that Worker. It can be installed the same way.

## First Setup

After installing, connect MailFlare to Cloudflare in one of two ways:

- **Cloudflare API**: paste a Cloudflare API token. See [API Token Setup](api-token.md).
- **Mailflare Worker**: enter your Worker's URL, then its admin token or, if the Worker has
  accounts, sign in with your account. See [Worker Mode](worker-mode.md).
