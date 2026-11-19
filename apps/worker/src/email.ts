// Incoming mail: the Worker is the catch-all target of every configured domain.
//
// - Mail for an alias is re-sent to its destination, with senders rewritten to
//   reverse addresses so replies go out through the alias. Without the
//   send_email binding (or if sending fails), it is forwarded unchanged.
// - Mail from the alias owner to a reverse address is sent to that contact,
//   from the alias. Accounts without the admin role may only send to the
//   alias's contacts (people who mailed it), within a daily limit.

import { EmailMessage } from "cloudflare:email";
import { and, eq, inArray, sql } from "drizzle-orm";

import { normalizeAddress, splitAddress } from "./addresses";
import { authenticatedFromDomain, checkSender } from "./auth";
import { createDb, type Db, schema } from "./db";
import {
    getHeaders,
    parseAddressList,
    type ParsedMessage,
    parseMessage,
    serializeMessage,
} from "./mime";
import {
    KEY_LENGTH,
    keyedReverseAddress,
    keyLengthFor,
    parseReverseTag,
    randomKey,
    readableReverseAddress,
    type ReverseTarget,
} from "./reverse";
import {
    ALIAS_HEADER,
    correspondents,
    messageIdsIn,
    referencedIds,
    rewriteInbound,
    rewriteOutbound,
    senderOf,
} from "./rewrite";
import { getSettings } from "./settings";

export { ALIAS_HEADER };

/**
 * One reason for unknown and disabled aliases alike, so senders cannot tell
 * which addresses exist.
 */
export const REJECT_REASON = "Address does not exist";

type AliasWithDestination = typeof schema.aliases.$inferSelect & {
    destination: typeof schema.destinations.$inferSelect;
    user: typeof schema.user.$inferSelect | null;
};

/** Aliases a message may pass through, one forwarding to the next. */
export const MAX_ALIAS_HOPS = 5;
export const LOOP_REASON = "Mail loop detected";

/**
 * Whether delivering to `alias` would go in circles: the message already
 * passed through it (aliases forwarding to each other, possibly across
 * Workers), or through more aliases than any sensible chain.
 */
export function isLooping(message: ParsedMessage, alias: string): boolean {
    const hops = getHeaders(message.headers, ALIAS_HEADER).map(normalizeAddress);
    return hops.includes(alias) || hops.length >= MAX_ALIAS_HOPS;
}

/** Splits a recipient into the alias address and the subaddress tag (original case). */
export function parseRecipient(recipient: string): { address: string; tag: string | null } | null {
    const parts = splitAddress(recipient.trim());
    if (!parts) return null;
    const plus = parts.local.indexOf("+");
    const local = plus > 0 ? parts.local.slice(0, plus) : parts.local;
    return {
        address: normalizeAddress(`${local}@${parts.domain}`),
        tag: plus > 0 ? parts.local.slice(plus + 1) : null,
    };
}

function findAlias(db: Db, address: string) {
    return db.query.aliases.findFirst({
        where: { address },
        with: { destination: true, user: true },
    });
}

type Outcome = "forwarded" | "blocked" | "sent";

function record(db: Db, aliasId: string, outcome: Outcome) {
    const { aliases } = schema;
    const counter = {
        forwarded: { forwardedCount: sql`${aliases.forwardedCount} + 1` },
        blocked: { blockedCount: sql`${aliases.blockedCount} + 1` },
        sent: { sentCount: sql`${aliases.sentCount} + 1` },
    }[outcome];
    return db
        .update(aliases)
        .set({ ...counter, lastEmailAt: new Date() })
        .where(eq(aliases.id, aliasId));
}

/** Addresses of one message that get reverse addresses; the rest are left out. */
export const MAX_CONTACTS_PER_MESSAGE = 50;

/** Splits a list for D1, which binds at most 100 parameters per statement. */
function chunks<T>(items: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
    return out;
}

/** How many fresh keys to try when another contact already owns one. */
const MAX_KEY_ATTEMPTS = 5;

/** Whether an insert failed because a contact already owns the key. */
function isKeyConflict(error: unknown): boolean {
    // Drizzle wraps the D1 error, which wraps the constraint error again.
    for (let current = error; current instanceof Error; current = current.cause) {
        if (current.message.includes("UNIQUE constraint failed: reverse_contacts.key")) {
            return true;
        }
    }
    return false;
}

/**
 * Records contacts of the alias (lowercase addresses), marking `replyable`
 * ones as people the owner may send to; returns each contact's short key.
 * Keys are as long as the alias's local part leaves room for (see keyLengthFor).
 */
async function rememberContacts(
    db: Db,
    aliasId: string,
    aliasAddress: string,
    emails: string[],
    replyable: Set<string>,
): Promise<Map<string, string>> {
    const { reverseContacts } = schema;
    const keys = new Map<string, string>();
    if (emails.length === 0) return keys;
    const keyLength = keyLengthFor(aliasAddress) || KEY_LENGTH;
    for (const chunk of chunks(emails, 15)) {
        let rows = chunk.map((email) => ({
            key: randomKey(keyLength),
            aliasId,
            email,
            replyable: replyable.has(email),
        }));
        for (let attempt = 1; ; attempt++) {
            try {
                await db
                    .insert(reverseContacts)
                    .values(rows)
                    .onConflictDoUpdate({
                        target: [reverseContacts.aliasId, reverseContacts.email],
                        set: {
                            // Once replyable, always replyable.
                            replyable: sql`max(${reverseContacts.replyable}, excluded.replyable)`,
                            // A key stored before the limit changed is too long to use.
                            key: sql`case when length(${reverseContacts.key}) > ${keyLength} then excluded.key else ${reverseContacts.key} end`,
                        },
                    });
                break;
            } catch (error) {
                // A key is unique across all aliases: another contact may own it.
                if (attempt >= MAX_KEY_ATTEMPTS || !isKeyConflict(error)) throw error;
                rows = rows.map((row) => ({ ...row, key: randomKey(keyLength) }));
            }
        }
    }
    for (const chunk of chunks(emails, 90)) {
        const rows = await db
            .select({ email: reverseContacts.email, key: reverseContacts.key })
            .from(reverseContacts)
            .where(
                and(eq(reverseContacts.aliasId, aliasId), inArray(reverseContacts.email, chunk)),
            );
        for (const row of rows) keys.set(row.email, row.key);
    }
    return keys;
}

/**
 * The people the owner may reply to: the sender, if Cloudflare authenticated
 * the From address (and it isn't the owner), and a Reply-To on that domain.
 * Others in To or Cc get reverse addresses for reply-all, nothing more, or
 * anyone could make an address a contact by putting it in Cc.
 */
function replyableContacts(parsed: ParsedMessage, ownerEmail: string): Set<string> {
    const domain = authenticatedFromDomain(parsed.headers);
    const replyable = new Set<string>();
    if (!domain) return replyable;
    const from = senderOf(parsed.headers, "").address.toLowerCase();
    if (from === ownerEmail.toLowerCase()) return replyable;
    replyable.add(from);
    for (const mailbox of getHeaders(parsed.headers, "Reply-To").flatMap(parseAddressList)) {
        const address = mailbox.address.toLowerCase();
        const on = splitAddress(address)?.domain ?? "";
        if (on === domain || on.endsWith(`.${domain}`)) replyable.add(address);
    }
    return replyable;
}

/** Maps Message-IDs of the alias: `by: "id"` from what contacts saw, `"original"` from the owner's. */
async function messageIdMap(
    db: Db,
    aliasId: string,
    ids: string[],
    by: "id" | "original",
): Promise<Map<string, string>> {
    const { messageIds } = schema;
    const map = new Map<string, string>();
    const column = by === "id" ? messageIds.id : messageIds.original;
    for (const chunk of chunks([...new Set(ids)], 90)) {
        const rows = await db
            .select()
            .from(messageIds)
            .where(and(eq(messageIds.aliasId, aliasId), inArray(column, chunk)));
        for (const row of rows) {
            if (by === "id") map.set(row.id, row.original);
            else map.set(row.original, row.id);
        }
    }
    return map;
}

/** Whether the owner may send from the alias to anyone, not just its contacts. */
const unrestricted = (alias: AliasWithDestination) =>
    alias.userId === null || alias.user?.role === "admin";

async function resolveReverse(
    db: Db,
    alias: AliasWithDestination,
    target: ReverseTarget,
): Promise<string | null> {
    if (target.kind === "address") {
        if (unrestricted(alias)) return target.contact;
        const known = await db.query.reverseContacts.findFirst({
            where: { aliasId: alias.id, email: target.contact.toLowerCase() },
        });
        return known?.replyable ? target.contact : null;
    }
    const row = await db.query.reverseContacts.findFirst({
        where: { key: target.key, aliasId: alias.id },
    });
    if (!row || (!unrestricted(alias) && !row.replyable)) return null;
    return row.email;
}

/** Counts a message toward the owner's daily limit; false once it is reached. */
async function withinDailyLimit(env: Env, db: Db, userId: string): Promise<boolean> {
    const { sendUsage } = schema;
    const day = new Date().toISOString().slice(0, 10);
    const [usage] = await db
        .insert(sendUsage)
        .values({ userId, day, count: 1 })
        .onConflictDoUpdate({
            target: [sendUsage.userId, sendUsage.day],
            set: { count: sql`${sendUsage.count} + 1` },
        })
        .returning({ count: sendUsage.count });
    return (usage?.count ?? 0) <= getSettings(env).limits.sendsPerDay;
}

/** EmailMessage takes a string or a stream; a stream keeps 8-bit bodies intact. */
function mime(bytes: Uint8Array): ReadableStream {
    return new Response(bytes).body!;
}

/** "E_CODE: message", e.g. "E_VALIDATION_ERROR: bare CR in email content". */
function errorCode(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    if (error && typeof error === "object" && "code" in error) {
        return `${String(error.code)}: ${message}`;
    }
    return message;
}

async function deliverToOwner(
    message: ForwardableEmailMessage,
    env: Env,
    db: Db,
    alias: AliasWithDestination,
    parsed: ParsedMessage,
) {
    const destination = alias.destination.email;
    // Bounces and other mail without a sender are forwarded as they are: re-sent
    // from the alias, a bounce about them could come back and go round again.
    if (env.EMAIL && message.from) {
        try {
            const contacts = correspondents(parsed.headers, message.from)
                .filter((address) => address !== alias.address)
                .slice(0, MAX_CONTACTS_PER_MESSAGE);
            const keys = await rememberContacts(
                db,
                alias.id,
                alias.address,
                contacts,
                replyableContacts(parsed, destination),
            );
            const rewritten = await rewriteInbound(parsed, {
                alias: alias.address,
                envelopeFrom: message.from,
                toReverse: async (contact) => {
                    const key = keys.get(contact.toLowerCase());
                    if (!key) return null;
                    return (
                        readableReverseAddress(alias.address, contact) ??
                        keyedReverseAddress(alias.address, key)
                    );
                },
                messageIds: await messageIdMap(db, alias.id, referencedIds(parsed.headers), "id"),
            });
            await env.EMAIL.send(
                new EmailMessage(alias.address, destination, mime(serializeMessage(rewritten))),
            );
            return;
        } catch (error) {
            // Still deliver, just without reply-through-alias.
            console.error(`Re-sending failed (${errorCode(error)}), forwarding instead`);
        }
    }
    await message.forward(destination, new Headers({ [ALIAS_HEADER]: alias.address }));
}

async function sendAsAlias(
    message: ForwardableEmailMessage,
    env: Env,
    db: Db,
    alias: AliasWithDestination,
    parsed: ParsedMessage,
    target: ReverseTarget,
): Promise<boolean> {
    if (!env.EMAIL) {
        message.setReject("Sending from aliases is not set up on this Mailflare Worker");
        return false;
    }
    const contact = await resolveReverse(db, alias, target);
    if (!contact) {
        message.setReject(
            unrestricted(alias)
                ? "Unknown reverse address"
                : "You can only reply to people who have emailed this alias",
        );
        return false;
    }
    if (!unrestricted(alias) && !(await withinDailyLimit(env, db, alias.userId!))) {
        message.setReject("You have reached today's sending limit");
        return false;
    }
    const aliasDomain = splitAddress(alias.address)!.domain;
    const messageId = `<${randomKey(24)}@${aliasDomain}>`;
    const rewritten = await rewriteOutbound(parsed, {
        alias: alias.address,
        fromReverse: async (address) => {
            const recipient = parseRecipient(address);
            if (recipient?.address !== alias.address || !recipient.tag) return null;
            const reverse = parseReverseTag(recipient.tag);
            return reverse ? resolveReverse(db, alias, reverse) : null;
        },
        messageId,
        messageIds: await messageIdMap(db, alias.id, referencedIds(parsed.headers), "original"),
    });
    try {
        await env.EMAIL.send(
            new EmailMessage(alias.address, contact, mime(serializeMessage(rewritten))),
        );
        // So the contact's replies thread with the owner's message again.
        const [original] = messageIdsIn(getHeaders(parsed.headers, "Message-ID").join(" "));
        if (original) {
            await db
                .insert(schema.messageIds)
                .values({ id: messageId, aliasId: alias.id, original })
                .onConflictDoNothing();
        }
        return true;
    } catch (error) {
        console.error(`Sending as ${alias.address} failed: ${errorCode(error)}`);
        message.setReject(`Could not send from ${alias.address} (${errorCode(error)})`);
        return false;
    }
}

export async function handleEmail(
    message: ForwardableEmailMessage,
    env: Env,
    ctx: ExecutionContext,
): Promise<void> {
    const db = createDb(env.DB);
    const recipient = parseRecipient(message.to);
    const alias = recipient ? await findAlias(db, recipient.address) : null;
    if (!recipient || !alias) {
        message.setReject(REJECT_REASON);
        return;
    }

    const raw = new Uint8Array(await new Response(message.raw).arrayBuffer());
    const parsed = parseMessage(raw);
    const target = recipient.tag ? parseReverseTag(recipient.tag) : null;

    // Suspended accounts and unconfirmed inboxes get nothing, like disabled aliases.
    const active = alias.enabled && !alias.user?.banned && alias.destination.verifiedAt !== null;

    if (target) {
        const { headers } = parsed;
        const sender = checkSender(headers, message.from, alias.destination.email, message.to);
        if (sender.owner && !sender.authenticated) {
            // Header names only (no values), to diagnose authentication setups.
            // The sender isn't told: a distinct answer would confirm to anyone
            // guessing that this address is the alias's destination.
            const names = headers.map((h) => h.name).join(", ");
            console.warn(`Not sending as ${alias.address}: ${sender.reason}. Headers: ${names}`);
        }
        if (sender.owner && sender.authenticated) {
            if (!active) {
                message.setReject("This alias is disabled");
                return;
            }
            if (await sendAsAlias(message, env, db, alias, parsed, target)) {
                ctx.waitUntil(record(db, alias.id, "sent"));
            }
            return;
        }
        // Anyone else writing to a reverse address is just mailing the alias.
    }

    if (!active) {
        ctx.waitUntil(record(db, alias.id, "blocked"));
        message.setReject(REJECT_REASON);
        return;
    }

    if (isLooping(parsed, alias.address)) {
        console.warn(`Refused mail for ${alias.address}: ${LOOP_REASON.toLowerCase()}`);
        ctx.waitUntil(record(db, alias.id, "blocked"));
        message.setReject(LOOP_REASON);
        return;
    }

    await deliverToOwner(message, env, db, alias, parsed);
    ctx.waitUntil(record(db, alias.id, "forwarded"));
}
