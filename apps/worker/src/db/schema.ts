import { sql } from "drizzle-orm";
import {
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { user } from "./auth-schema";

export * from "./auth-schema";

const id = () =>
    text("id")
        .primaryKey()
        .$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
    integer("created_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date());

/** Owning account; null for data managed with the ADMIN_TOKEN. */
const ownerId = () => text("user_id").references(() => user.id, { onDelete: "cascade" });

/** Domains this Worker receives mail for (its catch-all target). */
export const domains = sqliteTable("domains", {
    id: id(),
    name: text("name").notNull().unique(),
    /** Whether every account may create aliases on it (otherwise admins only). */
    shared: integer("shared", { mode: "boolean" }).notNull().default(false),
    createdAt: createdAt(),
});

/** Mailboxes aliases forward to. */
export const destinations = sqliteTable(
    "destinations",
    {
        id: id(),
        userId: ownerId(),
        email: text("email").notNull(),
        /** Set once the owner confirmed the mailbox; aliases only deliver to verified ones. */
        verifiedAt: integer("verified_at", { mode: "timestamp" }),
        /** SHA-256 of the pending verification token, hex. */
        verificationHash: text("verification_hash"),
        verificationSentAt: integer("verification_sent_at", { mode: "timestamp" }),
        createdAt: createdAt(),
    },
    (t) => [
        uniqueIndex("destinations_user_email").on(t.userId, t.email),
        // NULLs are distinct in the index above, so the token's own rows need their own.
        uniqueIndex("destinations_token_email")
            .on(t.email)
            .where(sql`${t.userId} IS NULL`),
        index("destinations_email").on(t.email),
        index("destinations_verification_hash")
            .on(t.verificationHash)
            .where(sql`${t.verificationHash} IS NOT NULL`),
    ],
);

export const aliases = sqliteTable(
    "aliases",
    {
        id: id(),
        userId: ownerId(),
        /** Full address, always lowercase. */
        address: text("address").notNull().unique(),
        domainId: text("domain_id")
            .notNull()
            .references(() => domains.id),
        destinationId: text("destination_id")
            .notNull()
            .references(() => destinations.id),
        description: text("description").notNull().default(""),
        enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
        createdAt: createdAt(),
        forwardedCount: integer("forwarded_count").notNull().default(0),
        blockedCount: integer("blocked_count").notNull().default(0),
        /** Messages sent from the alias through reverse addresses. */
        sentCount: integer("sent_count").notNull().default(0),
        lastEmailAt: integer("last_email_at", { mode: "timestamp" }),
    },
    (t) => [
        index("aliases_domain_created").on(t.domainId, t.createdAt),
        index("aliases_user_created").on(t.userId, t.createdAt),
        index("aliases_destination").on(t.destinationId),
    ],
);

/**
 * Addresses of deleted aliases. Only their previous owner (or an admin) may
 * create them again, so nobody receives mail meant for someone else, such as
 * password resets of accounts the old owner signed up for with the alias.
 */
export const retiredAddresses = sqliteTable("retired_addresses", {
    address: text("address").primaryKey(),
    /** The previous owner; null for the admin token. Not a foreign key: it outlives the account. */
    userId: text("user_id"),
    createdAt: createdAt(),
});

/**
 * Contacts of an alias: everyone who mailed it or was a recipient alongside
 * it. Accounts may only send from an alias to its contacts. The key is used in
 * reverse addresses whose readable form (alias+local=domain) would exceed the
 * 64-character local-part limit.
 */
export const reverseContacts = sqliteTable(
    "reverse_contacts",
    {
        /** The key in alias+=<key>@domain. */
        key: text("key").primaryKey(),
        aliasId: text("alias_id")
            .notNull()
            .references(() => aliases.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        /**
         * Whether accounts may send to this contact from the alias: the
         * authenticated sender of mail to it, not others in To or Cc.
         */
        replyable: integer("replyable", { mode: "boolean" }).notNull().default(true),
        createdAt: createdAt(),
    },
    (t) => [uniqueIndex("reverse_contacts_alias_email").on(t.aliasId, t.email)],
);

/**
 * Message-IDs of mail the owner sent from an alias. Outgoing mail gets a new
 * ID on the alias's domain (the original usually names the owner's mail
 * domain); replies are translated back, so both sides keep their threads.
 */
export const messageIds = sqliteTable(
    "message_ids",
    {
        /** The ID the contact sees, with angle brackets. */
        id: text("id").primaryKey(),
        aliasId: text("alias_id")
            .notNull()
            .references(() => aliases.id, { onDelete: "cascade" }),
        /** The ID the owner's mail client gave the message, with angle brackets. */
        original: text("original").notNull(),
        createdAt: createdAt(),
    },
    (t) => [index("message_ids_alias_original").on(t.aliasId, t.original)],
);

/** Verification emails sent for destinations, to limit them per account and inbox. */
export const verificationMails = sqliteTable(
    "verification_mails",
    {
        id: id(),
        /** The account that asked; null for the admin token. */
        userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
        email: text("email").notNull(),
        createdAt: createdAt(),
    },
    (t) => [
        index("verification_mails_user").on(t.userId, t.createdAt),
        index("verification_mails_email").on(t.email, t.createdAt),
    ],
);

/** Messages each account sent from its aliases, per UTC day (for the daily limit). */
export const sendUsage = sqliteTable(
    "send_usage",
    {
        userId: text("user_id")
            .notNull()
            .references(() => user.id, { onDelete: "cascade" }),
        /** YYYY-MM-DD, UTC. */
        day: text("day").notNull(),
        count: integer("count").notNull().default(0),
    },
    (t) => [primaryKey({ columns: [t.userId, t.day] })],
);
