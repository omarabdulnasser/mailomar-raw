---
title: Worker Mode
description: Store your aliases in your own Cloudflare Worker instead of Email Routing rules.
---

By default, every MailFlare alias is a Cloudflare Email Routing rule. In Worker mode, you deploy
the MailFlare Worker to your own Cloudflare account instead. It receives all mail for your
domains, and the aliases live in the Worker's D1 database.

## Why use it

|                          | Email Routing rules            | Worker mode                                            |
| ------------------------ | ------------------------------ | ------------------------------------------------------ |
| Aliases per domain       | 200 (Cloudflare's rule limit)  | No practical limit                                     |
| Mail to unknown aliases  | Handled by your catch-all rule | Rejected                                               |
| Mail to disabled aliases | Not forwarded                  | Rejected, and counted                                  |
| Subaddressing            | Optional Cloudflare setting    | `alias+anything@` always reaches `alias@`              |
| Filtering by alias       | By the `To` address            | Every forwarded mail has an `X-Mailflare-Alias` header |
| Statistics               | No                             | Mail forwarded, blocked and sent per alias             |
| Replies                  | From your real address         | From the alias                                         |
| Other people             | No                             | Optional accounts on domains you share                 |
| Setup                    | An API token                   | Deploy a Worker, then connect the app                  |
| Cost                     | Free                           | Free within the Workers Free plan's daily limits       |

## 1. Deploy the Worker

The quickest way is the deploy button. It copies the repository into a new GitHub repository on
your account, creates the Worker's D1 database, and deploys it:

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/Curetix/mailflare)

During setup, Cloudflare asks for an `ADMIN_TOKEN`. Use a long random string, for example the
output of `openssl rand -base64 32`, and keep it: you'll enter it in the app to connect. It also
asks for an `AUTH_SECRET`, another random string, which you only need for
[accounts](#5-accounts-optional).

To deploy from your own machine instead:

```bash
git clone https://github.com/Curetix/mailflare.git
cd mailflare
pnpm install
cd apps/worker
pnpm run deploy                           # builds the app, deploys, creates the D1 database and its tables
pnpm exec wrangler secret put ADMIN_TOKEN # paste your random string
```

This needs Node.js 22.12 or newer and [pnpm](https://pnpm.io). The Worker also runs a daily
cleanup of expired sign-in links and sessions (a cron trigger).

```bash
# Later, to update:
git pull
pnpm install
pnpm run deploy
```

The deploy output shows the Worker's URL, for example `https://mailflare.your-name.workers.dev`.
The Worker also serves the Mailflare web app at that URL, connected to itself.

## 2. Send your domains' mail to the Worker

For each domain, in the Cloudflare dashboard:

1. Open the domain, then **Email** → **Email Routing** → **Routing rules**.
2. Under **Catch-all address**, choose the action **Send to a Worker**, select `mailflare`, and
   enable it.

Email Routing rules still take priority over the catch-all. Existing rule-based aliases keep
working, and the Worker receives everything else.

## 3. Verify your destination addresses

The Worker can only forward to addresses you've verified in Cloudflare. Under **Email Routing** →
**Destination addresses**, add each mailbox you want to forward to and confirm the verification
email. A Cloudflare account can have up to 200 destination addresses.

## 4. Connect the app

Open the Worker's URL: it serves the MailFlare web app, connected to itself.

1. Open **Sign in with the admin token**, paste your `ADMIN_TOKEN` and select **Connect**.
2. Under **Admin** → **Domains** (in the sidebar on large screens; on phones, under **Settings**),
   add the domains you pointed at the Worker.
3. Under **Inboxes**, add the destination addresses you verified in step 3.

The extension and other copies of the web app connect too: on the sign-in screen, choose
**Mailflare Worker** and enter the Worker URL and your `ADMIN_TOKEN`. Domains and inboxes are
managed in the Worker's own app; **Settings** → **Domains, inboxes and account** opens it.

Creating, editing and deleting aliases then works the same as in the default mode, including the
quick-create button and the context menu. In the web app in a window at least 1280 pixels wide,
selecting an alias opens it next to the list, with what it handled: mail forwarded, blocked and sent, and when the
last one arrived.

## 5. Accounts (optional)

The Worker can also give other people (or yourself) accounts, with email and password, sign-in
links and passkeys. Accounts sign in to the app the Worker serves and create aliases on the
domains you share, forwarding to inboxes they confirm by email.

1. Set a second secret: `pnpm exec wrangler secret put AUTH_SECRET` (another random string).
2. Under the Worker's **Settings** → **Variables and Secrets**, set `ADMIN_EMAILS` to your own
   address, and `PUBLIC_SIGNUPS` to `true` if anyone may sign up. The
   [Worker's README](../../apps/worker/README.md#settings) lists all settings, including
   per-account limits.
3. Your domain needs Cloudflare Email Sending (Workers Paid plan) for the Worker to mail sign-in
   links and confirmations.
4. Sign in to the app the Worker serves with your `ADMIN_EMAILS` address: **Email me a sign-in
   link** (**Create account** only appears when `PUBLIC_SIGNUPS` is `true`). The account becomes
   an admin once its email is confirmed. Under **Admin** → **Domains**, turn on **Shared** for the
   domains accounts may use. Under **Admin** → **Accounts**, make accounts admins or suspend
   them; `ADMIN_EMAILS` only decides who the first admins are.

Every account has an **Account** page: change or set a password, add passkeys, see the signed-in
devices (including the extension) and sign them out, or delete the account with its aliases and
inboxes.

Accounts can use the extension too: under **Mailflare Worker** on its sign-in screen, enter the
Worker URL and select **Sign in with an account**. The Worker's app opens, asks you to allow the
extension, and gives it a session of its own.

Accounts can only send to people who emailed their alias themselves (from an address Cloudflare
could authenticate), up to a daily limit. Mailboxes like `postmaster@` or `admin@` on shared
domains are reserved for admins, and the address of a deleted alias stays with its owner. Turning
off **Shared** for a domain, or taking away an account's admin role, keeps the aliases the account
already has.
