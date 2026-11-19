---
title: Self-Hosting the Web App
description: Deploy your own instance of the MailFlare web app to Cloudflare Pages.
---

The MailFlare web app can be self-hosted on your own Cloudflare Pages project. This lets you have full control over the deployment and use your own domain.

## Prerequisites

- A [Cloudflare account](https://dash.cloudflare.com/sign-up)
- A domain with [Email Routing](https://developers.cloudflare.com/email-routing/) enabled
- [Node.js](https://nodejs.org/) 22.12 or newer and [pnpm](https://pnpm.io/)

> [!TIP]
> The repository's "Deploy to Cloudflare" button deploys the [Mailflare Worker](worker-mode.md)
> instead, which serves its own copy of the web app, connected to that Worker. This guide is for
> the web app that connects with a Cloudflare API token.

## Deployment

1. **Clone the repository**

    ```bash
    git clone https://github.com/Curetix/mailflare.git
    cd mailflare
    ```

2. **Install dependencies**

    ```bash
    pnpm install
    ```

3. **Build the web app**

    ```bash
    pnpm --filter @mailflare/web build
    ```

    The output will be in `apps/web/dist/`.

4. **Deploy to Cloudflare Pages**

    ```bash
    cd apps/web
    npx wrangler pages deploy dist --project-name mailflare
    ```

    Run it from `apps/web`: Wrangler deploys the `functions/` folder next to it, the API proxy.

    Other static hosts work for the app itself, but signing in with a Cloudflare API token needs
    the `/api` proxy, which only runs on Cloudflare Pages. Connecting to a Mailflare Worker works
    anywhere.

## How It Works

The web app is a static single-page application (SPA) built with Vite and React. It includes:

- **Cloudflare Pages Functions** at `/api/*` that proxy requests to the Cloudflare API. This avoids CORS issues when calling the Cloudflare API directly from the browser.
- **PWA support** via a service worker for offline caching of static assets.

All Cloudflare API communication happens through the `/api` proxy — there are no hardcoded domains. Your API token is sent from the browser to the Pages Function, which forwards it to `api.cloudflare.com`.

> [!TIP]
> No environment variables are required for the web app. Each user provides their own Cloudflare API token at login time, which is stored locally in their browser.

## Updating

To update your deployment to the latest version:

1. Pull the latest changes:

    ```bash
    git pull origin main
    ```

2. Rebuild and redeploy:

    ```bash
    pnpm install
    pnpm --filter @mailflare/web build
    cd apps/web
    npx wrangler pages deploy dist --project-name mailflare
    ```

## Custom Domain

To use a custom domain (e.g., `app.yourdomain.com`):

1. Go to your Cloudflare Pages project in the dashboard
2. Navigate to **Custom domains**
3. Click **Set up a custom domain**
4. Enter your desired domain and follow the DNS setup instructions

For more details, see [Cloudflare Pages custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/).
