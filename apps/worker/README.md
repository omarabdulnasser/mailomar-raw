# Mailflare Worker

A Cloudflare Worker that turns your Email Routing domains into an alias service.
Point a domain's catch-all rule at the Worker. It delivers mail for your aliases
and rejects everything else. Aliases live in D1, so you aren't limited to
Email Routing's 200 rules per domain.

The Worker also serves the Mailflare web app (built from `apps/web`), connected
to itself: everything under `/api/` is the API, every other path is the app.

To set it up and connect the Mailflare app, see the
[Worker mode guide](../../docs/guides/worker-mode.md).

## How it handles mail

- **Known, enabled alias:** re-sent to its destination, from the alias. The
  sender and other recipients become _reverse addresses_ such as
  `alias+bob=shop.com@your.domain`, shown as `"Bob (bob at shop.com)"`, so
  replies and reply-all go out through the alias (up to 50 addresses per
  message). An `X-Mailflare-Alias` header names the alias for mailbox filters.
  Mailing-list headers keep their web links, not their `mailto:` ones, which
  would mail the list from your own address. Bounces are forwarded unchanged.
- **Replies:** mail from the alias owner to a reverse address is sent to the
  contact behind it, from the alias, after checking Cloudflare's DMARC result
  for the owner's domain and that the message names the reverse address in
  To or Cc. It gets a new Message-ID on the alias's domain (the original
  usually names your mail provider); replies are mapped back, so threads stay
  intact. Mail to a reverse address from anyone else, or that fails these
  checks, is delivered to the owner like any other mail.
- **Subaddresses:** `alias+anything@domain` is delivered to `alias@domain`.
- **Unknown or disabled alias:** rejected with the same "Address does not
  exist" reason, so senders can't tell which addresses exist. Mail to disabled
  aliases is counted as blocked.
- **Mail loops:** destinations can't be on the Worker's own domains, and mail
  that already passed through the alias (for example, two aliases forwarding
  to each other, even across Workers) or through five aliases is rejected as
  a "Mail loop detected".
- **Without the `EMAIL` binding** (or if re-sending fails), mail is forwarded
  unchanged with `message.forward()`, which only reaches destinations verified
  in Cloudflare Email Routing. Replying through the alias then isn't possible.

A daily cron trigger deletes expired sign-in links and sessions, sign-ups
nobody confirmed, old rate-limit and sending counters, and Message-ID mappings
older than a year.

Re-sending to destinations verified in Cloudflare is free. Sending to anyone
else (replies, and destinations of accounts) needs the Workers Paid plan and
your domain onboarded for Email Sending.

## Accounts

The `ADMIN_TOKEN` manages the deployment's own domains, destinations and
aliases. With `AUTH_SECRET` set, people can also have accounts (email and
password, magic links, passkeys) under `/api/auth/*`, powered by
[better-auth](https://better-auth.com). They sign in to the app the Worker
serves; passkeys only work there, because they belong to the Worker's domain.
Links in the Worker's emails (confirming an account or an inbox, signing in,
resetting a password) open pages of that app. The extension signs in to
accounts through the app's `/authorize` page, which hands it a session of its
own (via `identity.launchWebAuthFlow`).

- Accounts create aliases on **shared** domains, forwarding to destinations
  they confirmed through a link the Worker mails them. The account's own email
  counts as confirmed.
- Accounts only see and change their own aliases and destinations; the admin
  token doesn't see accounts' data either.
- Accounts can only send to people who emailed the alias themselves, with a
  sender address Cloudflare authenticated (DMARC, or SPF on the same domain),
  and only up to a daily limit. Others in To or Cc of such mail get reverse
  addresses for reply-all, but accounts can't start conversations with them.
- Mailboxes like `postmaster@`, `admin@` or `webmaster@` (which certificate
  authorities use to verify domains) are reserved for admins, as is the
  sender of account emails. The address of a deleted alias stays with its
  owner: nobody else can create it again, except admins.
- Confirmation emails for inboxes are limited to 3 per inbox and 10 per
  account a day.
- Accounts with the `admin` role have no limits, may use every domain and
  manage domains and accounts, but don't see other accounts' aliases or
  inboxes either. `ADMIN_EMAILS` are the first admins: an account with one of
  these addresses gets the role once its email is confirmed. After that, roles
  are changed under Admin → Accounts; editing `ADMIN_EMAILS` doesn't change
  existing accounts.
- Sign-ups that aren't confirmed within a day are deleted.

### Settings

Set these as variables in the Worker's dashboard settings (they survive
deploys) or in `.dev.vars` for development:

| Variable                    | Default                              | Meaning                                                         |
| --------------------------- | ------------------------------------ | --------------------------------------------------------------- |
| `PUBLIC_SIGNUPS`            | `false`                              | `true` lets anyone create an account                            |
| `ADMIN_EMAILS`              |                                      | Comma-separated; may always sign up and become the first admins |
| `MAIL_FROM`                 | `Mailflare <mailflare@first-domain>` | Sender of account emails                                        |
| `TRUSTED_ORIGINS`           |                                      | Comma-separated extra origins allowed to call `/api/auth`       |
| `EXTENSION_IDS`             |                                      | Comma-separated IDs of other extension builds that may sign in  |
| `MAX_ALIASES_PER_USER`      | `100`                                | Per account without the admin role                              |
| `MAX_DESTINATIONS_PER_USER` | `5`                                  |                                                                 |
| `MAX_SENDS_PER_DAY`         | `50`                                 | Messages sent from aliases per account and UTC day              |

Secrets: `ADMIN_TOKEN` and `AUTH_SECRET` (`wrangler secret put <name>`).

## Develop

```sh
cp .dev.vars.example .dev.vars   # set ADMIN_TOKEN and AUTH_SECRET
pnpm build                       # builds the app into ./app (once, or after app changes)
pnpm dev                         # applies local migrations, starts wrangler dev
pnpm test                        # Vitest inside workerd
```

`wrangler dev` writes the emails the Worker sends (sign-in links and so on)
to files under `.wrangler/tmp/email/` and logs their paths.

To send a test email to the local Worker:

```sh
curl -X POST 'http://localhost:8787/cdn-cgi/local/email?from=a@example.com&to=alias%40your.domain' \
  --data-binary $'From: a@example.com\r\nTo: alias@your.domain\r\nSubject: Hi\r\nMessage-ID: <1@example.com>\r\n\r\nHello'
```

Schema changes: edit `src/db/schema.ts` (better-auth's tables are in
`src/db/auth-schema.ts`), then run `pnpm db:generate`. Drizzle writes a new
folder under `migrations/`, and Wrangler applies it.

## Deploy

```sh
pnpm run deploy                             # builds the app, deploys (creating D1 the first time), migrates
pnpm exec wrangler secret put ADMIN_TOKEN   # a long random string
pnpm exec wrangler secret put AUTH_SECRET   # another one, for accounts
```

Then, for each domain, set the Email Routing catch-all action to
"Send to a Worker" and choose `mailflare`. Add the domains and your
destinations in the app the Worker serves (**Admin** → **Domains**,
**Inboxes**) or through the API.

## API

The API takes and returns JSON. Every endpoint except `/api/info` requires
`Authorization: Bearer <token>`, where the token is the `ADMIN_TOKEN` or an
account's session token (returned in the `set-auth-token` header when signing
in). Timestamps are Unix seconds. Errors look like
`{ "error": { "code", "message" } }`. The types are in
[`src/api/types.ts`](src/api/types.ts).

| Method   | Path                              | Body or notes                                      |
| -------- | --------------------------------- | -------------------------------------------------- |
| `GET`    | `/api/info`                       | Public: `{ name, apiVersion, accounts }`           |
| `GET`    | `/api/v1/me`                      | Role, account and limits                           |
| `GET`    | `/api/v1/domains`                 | Accounts see shared domains                        |
| `POST`   | `/api/v1/domains`                 | Admins: `{ name, shared? }`                        |
| `PATCH`  | `/api/v1/domains/:id`             | Admins: `{ shared? }`                              |
| `DELETE` | `/api/v1/domains/:id`             | Admins; `409` while aliases use it                 |
| `GET`    | `/api/v1/destinations`            |                                                    |
| `POST`   | `/api/v1/destinations`            | `{ email }`; accounts get a confirmation email     |
| `POST`   | `/api/v1/destinations/:id/verify` | Mails a new confirmation link                      |
| `POST`   | `/api/verify-destination`         | Public: `{ token }` from the confirmation link     |
| `DELETE` | `/api/v1/destinations/:id`        | `409` while aliases use it                         |
| `GET`    | `/api/v1/aliases`                 | Optional `?domainId=`; newest first                |
| `POST`   | `/api/v1/aliases`                 | `{ address, destination, description?, enabled? }` |
| `PATCH`  | `/api/v1/aliases/:id`             | `{ destination?, description?, enabled? }`         |
| `DELETE` | `/api/v1/aliases/:id`             |                                                    |
| `POST`   | `/api/v1/sessions`                | Accounts: a session for another app, `{ token }`   |
| `DELETE` | `/api/v1/session`                 | Signs out the calling session                      |
| `GET`    | `/api/v1/users`                   | Admins                                             |
| `PATCH`  | `/api/v1/users/:id`               | Admins: `{ role?, banned? }`; banning signs out    |

The API also refuses changes that would create a mail loop: a destination on
one of the Worker's own domains, or a domain that an existing destination
already uses.
