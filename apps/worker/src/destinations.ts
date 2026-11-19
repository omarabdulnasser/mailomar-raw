// Destination verification for accounts: the Worker mails a one-time link to
// the mailbox, proving the account controls it before aliases deliver there.

import { and, eq, gt } from "drizzle-orm";

import { type Db, schema } from "./db";
import { sendAccountEmail } from "./mailer";

/** The app page the link opens; it confirms with a POST, so link scanners can't. */
export const VERIFY_PAGE = "/verify-destination";
const LINK_LIFETIME_MS = 24 * 60 * 60 * 1000;
/** Minimum time between two verification emails to the same destination. */
export const RESEND_INTERVAL_MS = 60 * 1000;

async function sha256(value: string) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

/** Stores a new verification token and mails its link. */
export async function sendDestinationVerification(
    env: Env,
    db: Db,
    destination: { id: string; email: string },
    origin: string,
) {
    const token = randomToken();
    await db
        .update(schema.destinations)
        .set({ verificationHash: await sha256(token), verificationSentAt: new Date() })
        .where(eq(schema.destinations.id, destination.id));
    const url = `${origin}${VERIFY_PAGE}?token=${token}`;
    await sendAccountEmail(env, db, {
        to: destination.email,
        subject: "Confirm this inbox for Mailflare",
        text: `Someone added ${destination.email} as an inbox for their Mailflare aliases.\n\nIf this was you, confirm it within 24 hours: ${url}\n\nOtherwise ignore this email; nothing will be forwarded to you.`,
    });
}

/**
 * Keeps the addresses of deleted aliases for their owner (see
 * retiredAddresses), so nobody else can create them again.
 */
export async function retireAddresses(
    db: Db,
    aliases: { address: string; userId: string | null }[],
) {
    for (const alias of aliases) {
        await db
            .insert(schema.retiredAddresses)
            .values({ address: alias.address, userId: alias.userId })
            .onConflictDoUpdate({
                target: schema.retiredAddresses.address,
                set: { userId: alias.userId, createdAt: new Date() },
            });
    }
}

/** Marks the destination with this token as verified; false for unknown or expired tokens. */
export async function verifyDestination(db: Db, token: string): Promise<boolean> {
    const { destinations } = schema;
    const verified = await db
        .update(destinations)
        .set({ verifiedAt: new Date(), verificationHash: null })
        .where(
            and(
                eq(destinations.verificationHash, await sha256(token)),
                gt(destinations.verificationSentAt, new Date(Date.now() - LINK_LIFETIME_MS)),
            ),
        )
        .returning({ id: destinations.id });
    return verified.length > 0;
}
