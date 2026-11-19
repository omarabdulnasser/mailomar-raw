// Accounts (better-auth): email + password, magic links and passkeys. Clients
// outside the Worker's origin (app, extension) use the session token as a
// bearer token (bearer plugin).

import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { passkey } from "@better-auth/passkey";
import { APIError } from "better-auth/api";
import { betterAuth } from "better-auth/minimal";
import { admin, bearer, magicLink } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { splitAddress } from "./addresses";
import { createDb, type Db, schema } from "./db";
import { retireAddresses } from "./destinations";
import { type AccountEmail, sendAccountEmail } from "./mailer";
import { getSettings } from "./settings";

export const AUTH_BASE_PATH = "/api/auth";

/**
 * The app page an account's verification email links to. Confirming takes a
 * click there, so link scanners in mailboxes can't verify an account that
 * someone else signed up with this address.
 */
export const VERIFY_EMAIL_PAGE = "/verify-email";

/**
 * The account email is a destination from the moment it is verified, unless
 * it is on one of the Worker's own domains: forwarding there would loop.
 */
async function addAccountDestination(db: Db, user: { id: string; email: string }) {
    const email = user.email.toLowerCase();
    const domain = splitAddress(email)?.domain ?? "";
    if (await db.query.domains.findFirst({ where: { name: domain } })) return;
    await db
        .insert(schema.destinations)
        .values({ userId: user.id, email, verifiedAt: new Date() })
        .onConflictDoUpdate({
            target: [schema.destinations.userId, schema.destinations.email],
            set: { verifiedAt: new Date(), verificationHash: null },
        });
}

/**
 * better-auth for one request: the base URL (and with it the passkey relying
 * party) is the origin the Worker is reached on.
 */
export function createAuth(
    env: Env,
    ctx: Pick<ExecutionContext, "waitUntil"> | undefined,
    origin: string,
) {
    if (!env.AUTH_SECRET) return null;
    const settings = getSettings(env);
    const db = createDb(env.DB);

    // Not awaited, so response times don't reveal whether an account exists.
    // `email` may decide in the background not to send anything (null).
    const send = (email: AccountEmail | (() => Promise<AccountEmail | null>)) => {
        const sending = (async () => {
            const mail = typeof email === "function" ? await email() : email;
            if (mail) await sendAccountEmail(env, db, mail);
        })().catch((error: unknown) => {
            console.error(
                `Account email failed: ${error instanceof Error ? error.message : error}`,
            );
        });
        if (ctx) ctx.waitUntil(sending);
    };

    return betterAuth({
        appName: "Mailflare",
        baseURL: origin,
        basePath: AUTH_BASE_PATH,
        secret: env.AUTH_SECRET,
        database: drizzleAdapter(db, { provider: "sqlite", schema }),
        trustedOrigins: settings.trustedOrigins,
        // Workers isolates don't share memory, so counters live in D1.
        rateLimit: { enabled: true, storage: "database" },
        // The client's IP on Cloudflare (used for rate limits and sessions).
        advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
        // Accounts can delete themselves (their aliases and inboxes go with
        // them); with a password, or within a day of signing in.
        user: {
            deleteUser: {
                enabled: true,
                // The aliases go, but their addresses stay reserved for the
                // account's owner (they may come back).
                beforeDelete: async (user) => {
                    const owned = await db.query.aliases.findMany({
                        where: { userId: user.id },
                        columns: { address: true, userId: true },
                    });
                    await retireAddresses(db, owned);
                },
            },
        },
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: true,
            // A reset is how people lock out someone who got hold of a session.
            revokeSessionsOnPasswordReset: true,
            sendResetPassword: async ({ user, url }) =>
                send({
                    to: user.email,
                    subject: "Reset your Mailflare password",
                    text: `Someone asked to reset the password of your Mailflare account.\n\nSet a new password: ${url}\n\nIf this wasn't you, ignore this email.`,
                }),
        },
        emailVerification: {
            sendOnSignUp: true,
            sendOnSignIn: true,
            autoSignInAfterVerification: true,
            sendVerificationEmail: async ({ user, token }) =>
                send({
                    to: user.email,
                    subject: "Verify your email for Mailflare",
                    text: `Confirm your email address to finish creating your Mailflare account:\n\n${origin}${VERIFY_EMAIL_PAGE}?token=${encodeURIComponent(token)}\n\nIf you didn't sign up, ignore this email: someone else entered your address.`,
                }),
            // ADMIN_EMAILS get the admin role once the address is proven to be
            // theirs, not when someone signs up with it.
            afterEmailVerification: async (user) => {
                if (settings.adminEmails.has(user.email.toLowerCase())) {
                    await db
                        .update(schema.user)
                        .set({ role: "admin" })
                        .where(eq(schema.user.id, user.id));
                }
            },
        },
        databaseHooks: {
            user: {
                create: {
                    before: async (user) => {
                        const email = user.email.toLowerCase();
                        const isAdmin = settings.adminEmails.has(email);
                        if (!settings.publicSignups && !isAdmin) {
                            // better-auth answers sign-ups refused with 403 like
                            // successful ones, so this doesn't reveal admin emails.
                            throw new APIError("FORBIDDEN", {
                                message: "Sign-ups are closed on this Mailflare Worker",
                            });
                        }
                        // Magic link sign-ups arrive verified; password sign-ups
                        // become admins in afterEmailVerification.
                        const role = isAdmin && user.emailVerified ? "admin" : "user";
                        return { data: { ...user, email, role } };
                    },
                    after: async (user) => {
                        if (user.emailVerified) await addAccountDestination(db, user);
                    },
                },
                update: {
                    after: async (user) => {
                        if (user.emailVerified) await addAccountDestination(db, user);
                    },
                },
            },
        },
        plugins: [
            admin(),
            bearer(),
            magicLink({
                // A database leak shouldn't hand out sign-ins.
                storeToken: "hashed",
                sendMagicLink: async ({ email, url }) =>
                    send(async () => {
                        // Magic links also sign up. When that would be refused,
                        // don't mail strangers; the answer looks the same.
                        const address = email.toLowerCase();
                        if (!settings.publicSignups && !settings.adminEmails.has(address)) {
                            const existing = await db.query.user.findFirst({
                                where: { email: address },
                                columns: { id: true },
                            });
                            if (!existing) return null;
                        }
                        return {
                            to: email,
                            subject: "Sign in to Mailflare",
                            text: `Sign in to your Mailflare account:\n\n${url}\n\nThe link works once and expires in 5 minutes. If you didn't ask for it, ignore this email.`,
                        };
                    }),
            }),
            passkey({ rpID: new URL(origin).hostname, rpName: "Mailflare", origin }),
        ],
    });
}

export type Auth = NonNullable<ReturnType<typeof createAuth>>;
export type SessionUser = Auth["$Infer"]["Session"]["user"];
