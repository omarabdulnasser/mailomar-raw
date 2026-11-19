import { fileURLToPath } from "node:url";

import { defineConfig } from "wxt";

export default defineConfig({
    modules: ["@wxt-dev/module-react"],
    imports: false,
    // WXT defaults to MV2 for Firefox; Mailflare has shipped MV3 there since 1.x.
    manifestVersion: 3,
    zip: {
        name: "mailflare",
        // Firefox reviewers rebuild from the sources ZIP, which needs the shared
        // packages and the workspace too (see SOURCE_CODE_REVIEW.md).
        sourcesRoot: fileURLToPath(new URL("../..", import.meta.url)),
        includeSources: [
            "package.json",
            "pnpm-lock.yaml",
            "pnpm-workspace.yaml",
            "tsconfig.json",
            "LICENSE",
            "SOURCE_CODE_REVIEW.md",
            "apps/extension/**",
            "packages/**",
            // The app's types for the Worker API (type-only imports).
            "apps/worker/package.json",
            "apps/worker/src/api/types.ts",
        ],
        excludeSources: ["**/README.md", "**/test/**"],
    },
    manifest: ({ browser }) => ({
        name: "MailFlare - Email Alias Extension",
        description:
            "Create and manage email aliases using Cloudflare Email Routing directly from your browser.",
        // identity: signing in to a Mailflare Worker with an account.
        permissions: [
            "contextMenus",
            "storage",
            "clipboardWrite",
            "activeTab",
            "identity",
            "scripting",
        ],
        host_permissions: ["https://api.cloudflare.com/*"],
        // The ID 1.x was published under, so Firefox users get the update.
        // 147: the Astryx theme is wrapped in CSS @scope (146), and its sliding
        // indicators use anchor positioning (147); older versions lose the theme.
        ...(browser === "firefox" && {
            browser_specific_settings: {
                gecko: {
                    id: "{f0bdc9fa-a062-4424-baee-16530c53aa06}",
                    strict_min_version: "147.0",
                },
            },
        }),
    }),
});
