declare namespace Cloudflare {
    interface Env {
        DB: D1Database;
        /** Bearer token for the management API. Set with `wrangler secret put ADMIN_TOKEN`. */
        ADMIN_TOKEN?: string;
        /** Signs account sessions. Without it, accounts are unavailable. */
        AUTH_SECRET?: string;
        /**
         * Email Service binding for re-sending incoming mail, sending from
         * aliases and account emails. Optional: without it, mail is forwarded
         * unchanged and accounts cannot verify their email.
         */
        EMAIL?: SendEmail;
        /** "true" lets anyone create an account. */
        PUBLIC_SIGNUPS?: string;
        /** Comma-separated emails that get the admin role (and may always sign up). */
        ADMIN_EMAILS?: string;
        /** Sender of account emails, e.g. "Mailflare <accounts@example.com>". */
        MAIL_FROM?: string;
        /** Comma-separated extra origins allowed to call the auth API (app, extension). */
        TRUSTED_ORIGINS?: string;
        /** Comma-separated IDs of extensions besides the published one that may sign in. */
        EXTENSION_IDS?: string;
        MAX_ALIASES_PER_USER?: string;
        MAX_DESTINATIONS_PER_USER?: string;
        MAX_SENDS_PER_DAY?: string;
    }

    /** Types `exports` from "cloudflare:workers" (used by tests). */
    interface GlobalProps {
        mainModule: typeof import("./index");
    }
}

interface Env extends Cloudflare.Env {}
