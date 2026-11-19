// Daily housekeeping (cron trigger): rows that only matter for a while.
// Reverse contacts stay: they are what lets the owner reply to old mail, and
// they go with their alias.

import { and, eq, lt } from "drizzle-orm";

import { createDb, schema } from "./db";

const DAY_MS = 24 * 60 * 60 * 1000;

export async function cleanup(env: Env, now = new Date()) {
    const db = createDb(env.DB);
    const yesterday = new Date(now.getTime() - DAY_MS);
    await db.batch([
        // Expired sign-in links, email confirmations and password resets.
        db.delete(schema.verification).where(lt(schema.verification.expiresAt, now)),
        db.delete(schema.session).where(lt(schema.session.expiresAt, now)),
        // Rate-limit windows are minutes long.
        db.delete(schema.rateLimit).where(lt(schema.rateLimit.lastRequest, yesterday.getTime())),
        // Sign-ups nobody confirmed: the address may not belong to whoever
        // signed up, so the account shouldn't wait for a click indefinitely.
        db
            .delete(schema.user)
            .where(and(eq(schema.user.emailVerified, false), lt(schema.user.createdAt, yesterday))),
        // The limit on verification emails looks at the last day.
        db
            .delete(schema.verificationMails)
            .where(lt(schema.verificationMails.createdAt, yesterday)),
        // Threads older than a year rarely get replies.
        db
            .delete(schema.messageIds)
            .where(lt(schema.messageIds.createdAt, new Date(now.getTime() - 365 * DAY_MS))),
        // Daily send limits only look at today (UTC).
        db
            .delete(schema.sendUsage)
            .where(lt(schema.sendUsage.day, yesterday.toISOString().slice(0, 10))),
    ]);
}
