---
title: API Token Setup
description: How to create a Cloudflare API token for MailFlare.
---

To manage your aliases as Email Routing rules, MailFlare needs a Cloudflare API token. Follow
these steps to create one. (With a [Mailflare Worker](worker-mode.md) you don't need one.)

## Creating the Token

1. Open [Cloudflare API Tokens](https://dash.cloudflare.com/profile/api-tokens)
2. Click **"Create Token"**, then select **"Create Custom Token"**
3. Choose a name, like "MailFlare" or "Email Extension"
4. Configure the following **permissions**:

| Resource | Permission              | Access |
| -------- | ----------------------- | ------ |
| Account  | Email Routing Addresses | Read   |
| Zone     | Email Routing Rules     | Edit   |
| Zone     | Zone                    | Read   |
| Zone     | Zone Settings           | Read   |

5. Set **Account Resources** to your Cloudflare account
6. Set **Zone Resources** to **"All zones"** or select specific zones you want to use
7. Optionally configure **Client IP Address Filtering** and **TTL** for extra security
8. Click **"Continue to summary"** and then **"Create Token"**
9. Copy the generated token

## Using the Token

1. Open MailFlare (extension popup or web app)
2. On the sign-in screen, keep **Cloudflare API** selected and paste the token into the
   **Cloudflare API Token** field
3. Click **"Save token"**

MailFlare will verify the token and load your domains. The token is stored locally in your browser and is never sent to any server other than Cloudflare's API.

## Security Notes

- The token only has access to email routing — it cannot modify DNS, firewall rules, or other Cloudflare settings
- You can revoke the token at any time from the [Cloudflare dashboard](https://dash.cloudflare.com/profile/api-tokens)
- In the extension, the token is sent straight to `api.cloudflare.com`. If you withdrew the
  extension's access to that site, MailFlare shows a banner with an **Allow access** button
- For the web app, API requests are proxied through Cloudflare Pages Functions to avoid CORS issues — the token is sent directly to Cloudflare's API and is not stored server-side
