// Management API for the Mailflare app and extension. Callers authenticate
// with the ADMIN_TOKEN or an account session token, both as bearer tokens.
// The token manages the deployment's own data; accounts manage their own
// aliases and destinations, on shared domains unless they are admins.

import { and, count, eq, gt, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { validator } from "hono/validator";
import { z } from "zod";

import { type Auth, AUTH_BASE_PATH, createAuth, type SessionUser } from "../accounts";
import {
    ALIAS_LOCAL_PART_PATTERN,
    DOMAIN_PATTERN,
    normalizeAddress,
    RESERVED_LOCAL_PARTS,
    splitAddress,
} from "../addresses";
import { createDb, type Db, schema } from "../db";
import {
    RESEND_INTERVAL_MS,
    retireAddresses,
    sendDestinationVerification,
    verifyDestination,
} from "../destinations";
import { isExtensionRedirect } from "../extensions";
import { getSettings } from "../settings";
import type * as Api from "./types";
import { API_VERSION } from "./types";

/** Who is calling: the deployment's admin token, or an account. */
type Principal =
    | { kind: "token" }
    | {
          kind: "user";
          user: SessionUser;
          session: { token: string; createdAt: Date };
          auth: Auth;
      };

type AppEnv = { Bindings: Env; Variables: { db: Db; principal: Principal } };

class ApiException extends HTTPException {
    constructor(
        status: ContentfulStatusCode,
        readonly code: string,
        message: string,
    ) {
        super(status, { message });
    }
}

const notFound = (what: string) => new ApiException(404, "not_found", `${what} not found`);

/** Validates a JSON body with a zod schema, answering 400 with the first issue. */
function json<T extends z.ZodType>(bodySchema: T) {
    return validator("json", (value) => {
        const result = bodySchema.safeParse(value);
        if (!result.success) {
            const issue = result.error.issues[0];
            const field = issue?.path.join(".");
            throw new ApiException(
                400,
                "invalid_request",
                field ? `${field}: ${issue?.message}` : (issue?.message ?? "Invalid request"),
            );
        }
        return result.data as z.output<T>;
    });
}

const seconds = (date: Date) => Math.floor(date.getTime() / 1000);

const toDomain = (d: typeof schema.domains.$inferSelect): Api.Domain => ({
    id: d.id,
    name: d.name,
    shared: d.shared,
    createdAt: seconds(d.createdAt),
});

const toDestination = (d: typeof schema.destinations.$inferSelect): Api.Destination => ({
    id: d.id,
    email: d.email,
    verified: d.verifiedAt !== null,
    createdAt: seconds(d.createdAt),
});

const toAlias = (
    a: typeof schema.aliases.$inferSelect & { destination: { email: string } },
): Api.Alias => ({
    id: a.id,
    address: a.address,
    domainId: a.domainId,
    destination: a.destination.email,
    description: a.description,
    enabled: a.enabled,
    createdAt: seconds(a.createdAt),
    forwardedCount: a.forwardedCount,
    blockedCount: a.blockedCount,
    sentCount: a.sentCount,
    lastEmailAt: a.lastEmailAt ? seconds(a.lastEmailAt) : null,
});

const toUser = (u: typeof schema.user.$inferSelect): Api.User => ({
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role === "admin" ? "admin" : "user",
    emailVerified: u.emailVerified,
    banned: u.banned ?? false,
    createdAt: seconds(u.createdAt),
});

const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email({ message: "Must be an email address" }));

const domainSchema = z
    .string()
    .trim()
    .toLowerCase()
    .regex(DOMAIN_PATTERN, "Must be a domain name like example.com");

const descriptionSchema = z.string().max(500);

const isAdmin = (p: Principal) => p.kind === "token" || p.user.role === "admin";

/** Whether accounts may not create aliases with this local part. */
function isReserved(env: Env, local: string) {
    const mailFrom = getSettings(env).mailFrom;
    const sender = mailFrom && /<([^<>]+)>|^\s*(\S+@\S+)\s*$/.exec(mailFrom);
    const senderLocal = sender ? splitAddress(sender[1] ?? sender[2] ?? "")?.local : undefined;
    return RESERVED_LOCAL_PARTS.has(local) || local === senderLocal?.toLowerCase();
}

/** The user_id of rows the caller owns (null: the token's own rows). */
const ownerOf = (p: Principal) => (p.kind === "user" ? p.user.id : null);

/** Relational-query filter for rows owned by the caller. */
const owned = (p: Principal) => {
    const owner = ownerOf(p);
    return owner === null ? { userId: { isNull: true as const } } : { userId: owner };
};

function requireAdmin(p: Principal) {
    if (!isAdmin(p)) throw new ApiException(403, "forbidden", "Only admins can do this");
}

function limitsFor(env: Env, p: Principal): Api.Limits | null {
    return isAdmin(p) ? null : getSettings(env).limits;
}

const originOf = (c: Context) => new URL(c.req.url).origin;

/** Verification emails per day: per account, and to one inbox from all accounts. */
export const VERIFICATION_MAILS_PER_ACCOUNT = 10;
export const VERIFICATION_MAILS_PER_INBOX = 3;

/**
 * Refuses another verification email when the account, or anyone, asked for
 * too many today, so adding and deleting an inbox can't flood a stranger.
 */
async function checkVerificationMails(db: Db, p: Principal, email: string) {
    const { verificationMails } = schema;
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [[byAccount], [byInbox]] = await Promise.all([
        db
            .select({ total: count() })
            .from(verificationMails)
            .where(
                and(
                    eq(verificationMails.userId, ownerOf(p) ?? ""),
                    gt(verificationMails.createdAt, since),
                ),
            ),
        db
            .select({ total: count() })
            .from(verificationMails)
            .where(and(eq(verificationMails.email, email), gt(verificationMails.createdAt, since))),
    ]);
    if (
        (byAccount?.total ?? 0) >= VERIFICATION_MAILS_PER_ACCOUNT ||
        (byInbox?.total ?? 0) >= VERIFICATION_MAILS_PER_INBOX
    ) {
        throw new ApiException(
            429,
            "too_many",
            "Too many confirmation emails today. Try again tomorrow.",
        );
    }
}

async function sendVerification(c: Context<AppEnv>, destination: { id: string; email: string }) {
    const { db, principal } = c.var;
    await db
        .insert(schema.verificationMails)
        .values({ userId: ownerOf(principal), email: destination.email });
    await sendDestinationVerification(c.env, db, destination, originOf(c));
}

async function findDestination(db: Db, p: Principal, email: string) {
    const destination = await db.query.destinations.findFirst({
        where: { email, ...owned(p) },
    });
    if (!destination) {
        throw new ApiException(400, "unknown_destination", `Unknown destination ${email}`);
    }
    if (!destination.verifiedAt) {
        throw new ApiException(
            400,
            "unverified_destination",
            `Confirm ${email} with the link we mailed to it first`,
        );
    }
    return destination;
}

async function getAlias(db: Db, p: Principal, id: string) {
    const alias = await db.query.aliases.findFirst({
        where: { id, ...owned(p) },
        with: { destination: true },
    });
    if (!alias) throw notFound("Alias");
    return alias;
}

/** Equal-time token check: compares SHA-256 digests, which always have equal length. */
async function tokensMatch(given: string, expected: string) {
    const encoder = new TextEncoder();
    const [a, b] = await Promise.all([
        crypto.subtle.digest("SHA-256", encoder.encode(given)),
        crypto.subtle.digest("SHA-256", encoder.encode(expected)),
    ]);
    return crypto.subtle.timingSafeEqual(a, b);
}

const v1 = new Hono<AppEnv>();

v1.use(async (c, next) => {
    const header = c.req.header("Authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
    const auth = createAuth(c.env, c.executionCtx, originOf(c));
    // Fail closed: without a token or accounts configured, nobody gets in.
    if (!c.env.ADMIN_TOKEN && !auth) {
        throw new ApiException(
            503,
            "not_configured",
            "Set the ADMIN_TOKEN or AUTH_SECRET secret to use the API",
        );
    }

    let principal: Principal | null = null;
    if (token && c.env.ADMIN_TOKEN && (await tokensMatch(token, c.env.ADMIN_TOKEN))) {
        principal = { kind: "token" };
    } else if (auth) {
        // Bearer tokens only: the session cookie of the Worker's own app is
        // exchanged for a token through /api/auth, never accepted here.
        const headers = new Headers(header ? { Authorization: header } : undefined);
        const session = await auth.api.getSession({ headers });
        if (session?.user.banned) {
            throw new ApiException(403, "banned", "This account is suspended");
        }
        if (session) {
            principal = {
                kind: "user",
                user: session.user,
                session: session.session,
                auth,
            };
        }
    }
    if (!principal) throw new ApiException(401, "unauthorized", "Invalid or missing API token");

    c.set("db", createDb(c.env.DB));
    c.set("principal", principal);
    await next();
});

v1.get("/me", (c) => {
    const { principal } = c.var;
    return c.json<Api.Me>({
        role: isAdmin(principal) ? "admin" : "user",
        user:
            principal.kind === "user"
                ? { id: principal.user.id, email: principal.user.email, name: principal.user.name }
                : null,
        limits: limitsFor(c.env, principal),
    });
});

/** The user agent recorded for sessions handed to other apps. */
const APP_SESSION_AGENT = "Mailflare extension";

// Sessions: the Worker's app hands other apps (the extension) a session of
// their own, so signing out of one doesn't sign out the other.

v1.post("/sessions", json(z.object({ redirectUri: z.string() })), async (c) => {
    const { principal } = c.var;
    if (principal.kind !== "user") {
        throw new ApiException(400, "not_an_account", "Only accounts can authorize apps");
    }
    // Only the extensions this Worker knows get a session, at their own
    // identity.launchWebAuthFlow redirect.
    const { redirectUri } = c.req.valid("json");
    if (!(await isExtensionRedirect(redirectUri, getSettings(c.env).extensionIds))) {
        throw new ApiException(400, "unknown_app", "This app may not use accounts of this Worker");
    }
    const context = await principal.auth.$context;
    // Named, so the account's list of signed-in devices can tell it apart.
    // As old as the session it comes from: minting one never makes a
    // session fresh enough for what needs a recent sign-in.
    const session = await context.internalAdapter.createSession(
        principal.user.id,
        false,
        { userAgent: APP_SESSION_AGENT, createdAt: principal.session.createdAt },
        true,
    );
    return c.json<Api.NewSession>({ token: session.token }, 201);
});

/** Signs out the calling session; nothing to do for the admin token. */
v1.delete("/session", async (c) => {
    const { principal } = c.var;
    if (principal.kind === "user") {
        const context = await principal.auth.$context;
        await context.internalAdapter.deleteSession(principal.session.token);
    }
    return c.body(null, 204);
});

// Domains: admins manage them; accounts see the shared ones.

v1.get("/domains", async (c) => {
    const rows = await c.var.db.query.domains.findMany({
        ...(!isAdmin(c.var.principal) && { where: { shared: true } }),
        orderBy: { name: "asc" },
    });
    return c.json<Api.Domain[]>(rows.map(toDomain));
});

v1.post(
    "/domains",
    json(z.object({ name: domainSchema, shared: z.boolean().optional() })),
    async (c) => {
        requireAdmin(c.var.principal);
        const { db } = c.var;
        const { name, shared } = c.req.valid("json");
        if (await db.query.domains.findFirst({ where: { name } })) {
            throw new ApiException(409, "already_exists", `Domain ${name} already exists`);
        }
        // Forwarding to an address on our own domain would loop.
        if (await db.query.destinations.findFirst({ where: { email: { like: `%@${name}` } } })) {
            throw new ApiException(400, "mail_loop", `A destination already uses ${name}`);
        }
        const [domain] = await db
            .insert(schema.domains)
            .values({ name, shared: shared ?? false })
            .returning();
        return c.json<Api.Domain>(toDomain(domain!), 201);
    },
);

v1.patch("/domains/:id", json(z.object({ shared: z.boolean().optional() })), async (c) => {
    requireAdmin(c.var.principal);
    const { db } = c.var;
    const id = c.req.param("id");
    const { shared } = c.req.valid("json");
    if (shared !== undefined) {
        await db.update(schema.domains).set({ shared }).where(eq(schema.domains.id, id));
    }
    const domain = await db.query.domains.findFirst({ where: { id } });
    if (!domain) throw notFound("Domain");
    return c.json<Api.Domain>(toDomain(domain));
});

v1.delete("/domains/:id", async (c) => {
    requireAdmin(c.var.principal);
    const { db } = c.var;
    const id = c.req.param("id");
    if (!(await db.query.domains.findFirst({ where: { id } }))) throw notFound("Domain");
    if (await db.query.aliases.findFirst({ where: { domainId: id } })) {
        throw new ApiException(409, "in_use", "Delete the domain's aliases first");
    }
    await db.delete(schema.domains).where(eq(schema.domains.id, id));
    return c.body(null, 204);
});

// Destinations

v1.get("/destinations", async (c) => {
    const rows = await c.var.db.query.destinations.findMany({
        where: owned(c.var.principal),
        orderBy: { email: "asc" },
    });
    return c.json<Api.Destination[]>(rows.map(toDestination));
});

v1.post("/destinations", json(z.object({ email: emailSchema })), async (c) => {
    const { db, principal } = c.var;
    const { email } = c.req.valid("json");
    if (await db.query.destinations.findFirst({ where: { email, ...owned(principal) } })) {
        throw new ApiException(409, "already_exists", `Destination ${email} already exists`);
    }
    const domain = splitAddress(email)?.domain ?? "";
    if (await db.query.domains.findFirst({ where: { name: domain } })) {
        throw new ApiException(400, "mail_loop", "Destinations cannot use this Worker's domains");
    }
    const limits = limitsFor(c.env, principal);
    if (limits) {
        const [row] = await db
            .select({ total: count() })
            .from(schema.destinations)
            .where(eq(schema.destinations.userId, ownerOf(principal)!));
        if ((row?.total ?? 0) >= limits.destinations) {
            throw new ApiException(
                403,
                "limit_reached",
                `Accounts can have up to ${limits.destinations} destinations`,
            );
        }
    }

    // The token's destinations are verified in Cloudflare by the admin; an
    // account's verified email needs no second confirmation.
    const preVerified =
        principal.kind === "token" ||
        (principal.user.emailVerified && principal.user.email.toLowerCase() === email);
    if (!preVerified) await checkVerificationMails(db, principal, email);
    const [destination] = await db
        .insert(schema.destinations)
        .values({ email, userId: ownerOf(principal), verifiedAt: preVerified ? new Date() : null })
        .returning();
    if (!preVerified) await sendVerification(c, destination!);
    return c.json<Api.Destination>(toDestination(destination!), 201);
});

/** Mails a new verification link. */
v1.post("/destinations/:id/verify", async (c) => {
    const { db, principal } = c.var;
    const destination = await db.query.destinations.findFirst({
        where: { id: c.req.param("id"), ...owned(principal) },
    });
    if (!destination) throw notFound("Destination");
    if (destination.verifiedAt) {
        throw new ApiException(409, "already_verified", "This destination is already verified");
    }
    const lastSent = destination.verificationSentAt?.getTime() ?? 0;
    if (Date.now() - lastSent < RESEND_INTERVAL_MS) {
        throw new ApiException(429, "too_soon", "Wait a minute before requesting another email");
    }
    await checkVerificationMails(db, principal, destination.email);
    await sendVerification(c, destination);
    return c.body(null, 204);
});

v1.delete("/destinations/:id", async (c) => {
    const { db, principal } = c.var;
    const id = c.req.param("id");
    if (!(await db.query.destinations.findFirst({ where: { id, ...owned(principal) } }))) {
        throw notFound("Destination");
    }
    if (await db.query.aliases.findFirst({ where: { destinationId: id } })) {
        throw new ApiException(409, "in_use", "Aliases still forward to this destination");
    }
    await db.delete(schema.destinations).where(eq(schema.destinations.id, id));
    return c.body(null, 204);
});

// Aliases

v1.get("/aliases", async (c) => {
    const domainId = c.req.query("domainId");
    const rows = await c.var.db.query.aliases.findMany({
        where: { ...owned(c.var.principal), ...(domainId && { domainId }) },
        with: { destination: true },
        orderBy: { createdAt: "desc" },
    });
    return c.json<Api.Alias[]>(rows.map(toAlias));
});

v1.post(
    "/aliases",
    json(
        z.object({
            address: z.string().trim().toLowerCase(),
            destination: emailSchema,
            description: descriptionSchema.optional(),
            enabled: z.boolean().optional(),
        }),
    ),
    async (c) => {
        const { db, principal } = c.var;
        const body = c.req.valid("json");
        const address = normalizeAddress(body.address);
        const parts = splitAddress(address);
        if (!parts || !ALIAS_LOCAL_PART_PATTERN.test(parts.local)) {
            throw new ApiException(
                400,
                "invalid_address",
                "Alias names may use letters, digits, dots, underscores and hyphens",
            );
        }
        const domain = await db.query.domains.findFirst({ where: { name: parts.domain } });
        if (!domain || (!domain.shared && !isAdmin(principal))) {
            throw new ApiException(
                400,
                "unknown_domain",
                `Domain ${parts.domain} is not available`,
            );
        }
        if (!isAdmin(principal) && isReserved(c.env, parts.local)) {
            throw new ApiException(400, "reserved", `${parts.local}@ is reserved for admins`);
        }
        if (await db.query.aliases.findFirst({ where: { address } })) {
            throw new ApiException(409, "already_exists", `Alias ${address} already exists`);
        }
        // Addresses of deleted aliases stay with their owner; admins may reuse them.
        const retired = await db.query.retiredAddresses.findFirst({ where: { address } });
        if (retired && retired.userId !== ownerOf(principal) && !isAdmin(principal)) {
            throw new ApiException(
                409,
                "already_exists",
                `Alias ${address} was used before and can't be created again`,
            );
        }
        const limits = limitsFor(c.env, principal);
        if (limits) {
            const [row] = await db
                .select({ total: count() })
                .from(schema.aliases)
                .where(eq(schema.aliases.userId, ownerOf(principal)!));
            if ((row?.total ?? 0) >= limits.aliases) {
                throw new ApiException(
                    403,
                    "limit_reached",
                    `Accounts can have up to ${limits.aliases} aliases`,
                );
            }
        }
        const destination = await findDestination(db, principal, body.destination);
        if (retired) {
            await db
                .delete(schema.retiredAddresses)
                .where(eq(schema.retiredAddresses.address, address));
        }
        const [alias] = await db
            .insert(schema.aliases)
            .values({
                address,
                userId: ownerOf(principal),
                domainId: domain.id,
                destinationId: destination.id,
                description: body.description ?? "",
                enabled: body.enabled ?? true,
            })
            .returning();
        return c.json<Api.Alias>(toAlias({ ...alias!, destination }), 201);
    },
);

v1.patch(
    "/aliases/:id",
    json(
        z.object({
            destination: emailSchema.optional(),
            description: descriptionSchema.optional(),
            enabled: z.boolean().optional(),
        }),
    ),
    async (c) => {
        const { db, principal } = c.var;
        const id = c.req.param("id");
        const body = c.req.valid("json");
        await getAlias(db, principal, id);
        const destination =
            body.destination !== undefined
                ? await findDestination(db, principal, body.destination)
                : null;
        const changes = {
            ...(destination && { destinationId: destination.id }),
            ...(body.description !== undefined && { description: body.description }),
            ...(body.enabled !== undefined && { enabled: body.enabled }),
        };
        if (Object.keys(changes).length > 0) {
            await db.update(schema.aliases).set(changes).where(eq(schema.aliases.id, id));
        }
        return c.json<Api.Alias>(toAlias(await getAlias(db, principal, id)));
    },
);

v1.delete("/aliases/:id", async (c) => {
    const { db, principal } = c.var;
    const { aliases } = schema;
    const id = c.req.param("id");
    const owner = ownerOf(principal);
    const result = await db
        .delete(aliases)
        .where(
            and(
                eq(aliases.id, id),
                owner === null ? isNull(aliases.userId) : eq(aliases.userId, owner),
            ),
        )
        .returning();
    if (result.length === 0) throw notFound("Alias");
    await retireAddresses(db, result);
    return c.body(null, 204);
});

// Accounts (admins only)

v1.get("/users", async (c) => {
    requireAdmin(c.var.principal);
    const rows = await c.var.db.query.user.findMany({ orderBy: { createdAt: "asc" } });
    return c.json<Api.User[]>(rows.map(toUser));
});

v1.patch(
    "/users/:id",
    json(z.object({ role: z.enum(["admin", "user"]).optional(), banned: z.boolean().optional() })),
    async (c) => {
        const { db, principal } = c.var;
        requireAdmin(principal);
        const id = c.req.param("id");
        const body = c.req.valid("json");
        if (principal.kind === "user" && principal.user.id === id) {
            throw new ApiException(400, "self", "You cannot change your own role or ban yourself");
        }
        const changes = {
            ...(body.role !== undefined && { role: body.role }),
            ...(body.banned !== undefined && { banned: body.banned }),
        };
        if (Object.keys(changes).length > 0) {
            await db.update(schema.user).set(changes).where(eq(schema.user.id, id));
        }
        // Banned accounts are signed out everywhere.
        if (body.banned) await db.delete(schema.session).where(eq(schema.session.userId, id));
        const user = await db.query.user.findFirst({ where: { id } });
        if (!user) throw notFound("User");
        return c.json<Api.User>(toUser(user));
    },
);

export const app = new Hono<{ Bindings: Env }>();

// Bearer tokens, no cookies: any origin may call the API (the app runs in
// browsers and extensions), but only with a token.
app.use(
    "/api/*",
    cors({
        origin: "*",
        allowHeaders: ["Authorization", "Content-Type"],
        allowMethods: ["GET", "POST", "PATCH", "DELETE"],
        // The bearer plugin returns new session tokens in this header.
        exposeHeaders: ["set-auth-token"],
        maxAge: 86400,
    }),
);

app.get("/api/info", (c) =>
    c.json<Api.ApiInfo>({
        name: "mailflare",
        apiVersion: API_VERSION,
        accounts: {
            enabled: Boolean(c.env.AUTH_SECRET),
            publicSignups: Boolean(c.env.AUTH_SECRET) && getSettings(c.env).publicSignups,
        },
    }),
);

app.on(["GET", "POST"], `${AUTH_BASE_PATH}/*`, (c) => {
    // The admin plugin's own endpoints (impersonating accounts, setting their
    // passwords) would let admins into accounts' data, which /api/v1 keeps
    // from them. Admins manage accounts through /api/v1/users.
    if (c.req.path.startsWith(`${AUTH_BASE_PATH}/admin/`)) throw notFound("Endpoint");
    const auth = createAuth(c.env, c.executionCtx, originOf(c));
    if (!auth) {
        throw new ApiException(503, "not_configured", "Set the AUTH_SECRET secret for accounts");
    }
    return auth.handler(c.req.raw);
});

app.post("/api/verify-destination", json(z.object({ token: z.string() })), async (c) => {
    const { token } = c.req.valid("json");
    if (!(await verifyDestination(createDb(c.env.DB), token))) {
        throw new ApiException(
            400,
            "invalid_token",
            "This link is invalid or has expired. Request a new one in the Mailflare app.",
        );
    }
    return c.json({ verified: true });
});

app.route("/api/v1", v1);

app.notFound((c) =>
    c.json<Api.ApiError>({ error: { code: "not_found", message: "Not found" } }, 404),
);

app.onError((error, c) => {
    if (error instanceof ApiException) {
        return c.json<Api.ApiError>(
            { error: { code: error.code, message: error.message } },
            error.status,
        );
    }
    if (error instanceof HTTPException) {
        return c.json<Api.ApiError>(
            { error: { code: "http_error", message: error.message } },
            error.status,
        );
    }
    console.error(error);
    return c.json<Api.ApiError>(
        { error: { code: "internal_error", message: "Internal error" } },
        500,
    );
});
