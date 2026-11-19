---
title: Web App
description: Using MailFlare as a web application.
---

The MailFlare web app has the same alias management as the browser extension, on any device with
a web browser.

## Access

- **[app.mailflare.cc](https://app.mailflare.cc)**, hosted on Cloudflare Pages. It connects with a
  Cloudflare API token or to any Mailflare Worker.
- **Your Mailflare Worker's URL**: every [Worker](../guides/worker-mode.md) serves its own copy,
  connected to that Worker. That's where Worker accounts sign in, and where domains, inboxes,
  accounts and your account settings are managed.
- **Your own deployment**: see [Self-Hosting the Web App](../guides/self-hosting.md).

## Layout

On phones, the app looks like the extension: the list on top, tabs at the bottom. From 1024 pixels
wide it has a sidebar with your domains and pages, and from 1280 pixels the selected alias opens
next to the list, with the Worker's statistics for it.

## API Proxy

With a Cloudflare API token, the web app talks to the Cloudflare API through a proxy: Cloudflare
Pages Functions forward the requests to `api.cloudflare.com`, because browsers can't call it
directly (CORS). Your token is passed on to Cloudflare and never stored on the server. The proxy
only passes on the requests Mailflare makes (domains, inboxes and routing rules), only for the app
on its own site, and nothing but the token and the request itself. A Mailflare Worker is called
directly.

## PWA Support

The web app is a Progressive Web App (PWA) and can be installed on your device:

- **Desktop (Chrome/Edge)**: click the install icon in the address bar
- **iOS (Safari)**: tap Share → "Add to Home Screen"
- **Android (Chrome)**: tap the three-dot menu → "Add to Home screen"

Once installed, it opens like an app and shows cached data offline. New versions install
themselves: the app reloads once when an update is ready.

## Differences from the Extension

| Feature                             | Extension | Web App |
| ----------------------------------- | --------- | ------- |
| Context menu alias generation       | ✅        | ❌      |
| Quick-create button in email fields | ✅        | ❌      |
| Website Domain alias format         | ✅        | ❌      |
| Installable as a PWA                | ❌        | ✅      |
| Works on any device                 | ❌        | ✅      |
