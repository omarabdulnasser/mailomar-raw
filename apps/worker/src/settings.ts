// Deployment settings from environment variables (see wrangler.jsonc "vars").

import { PUBLISHED_EXTENSION_IDS } from "./extensions";

const list = (value: string | undefined) =>
    (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);

function limit(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export type Settings = ReturnType<typeof getSettings>;

export function getSettings(env: Env) {
    return {
        publicSignups: env.PUBLIC_SIGNUPS === "true",
        adminEmails: new Set(list(env.ADMIN_EMAILS).map((email) => email.toLowerCase())),
        mailFrom: env.MAIL_FROM?.trim() || null,
        trustedOrigins: list(env.TRUSTED_ORIGINS),
        /** Extensions that may sign in to accounts (see extensions.ts). */
        extensionIds: new Set([...PUBLISHED_EXTENSION_IDS, ...list(env.EXTENSION_IDS)]),
        /** Limits for accounts without the admin role. */
        limits: {
            aliases: limit(env.MAX_ALIASES_PER_USER, 100),
            destinations: limit(env.MAX_DESTINATIONS_PER_USER, 5),
            sendsPerDay: limit(env.MAX_SENDS_PER_DAY, 50),
        },
    };
}
