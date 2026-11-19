import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import type * as Api from "../src/api/types";
import { cleanup } from "../src/cleanup";
import { redirectHost } from "../src/extensions";
import {
    api,
    confirmEmail,
    EXTENSION_REDIRECT,
    lastMailTo,
    linkIn,
    PASSWORD,
    request,
    signIn,
    signUp,
} from "./helpers";

/** A shared domain for accounts, created with the admin token. */
async function sharedDomain(name: string) {
    const { body } = await api<Api.Domain>("POST", "/api/v1/domains", { name, shared: true });
    return body;
}

describe("signing up", () => {
    it("requires a verified email, then signs in with a bearer token", async () => {
        const email = "new@user.test";
        const signUpResponse = await request("POST", "/api/auth/sign-up/email", {
            email,
            password: PASSWORD,
            name: "New",
        });
        expect(signUpResponse.ok).toBe(true);
        // Unverified: no sign-in yet.
        const early = await request("POST", "/api/auth/sign-in/email", {
            email,
            password: PASSWORD,
        });
        expect(early.status).toBe(403);

        // The email links to the app, which confirms only after a click: a
        // link scanner fetching the link verifies nothing.
        const link = new URL(linkIn(lastMailTo(email)));
        expect(link.pathname).toBe("/verify-email");
        await request("GET", link.href);
        const scanned = await request("POST", "/api/auth/sign-in/email", {
            email,
            password: PASSWORD,
        });
        expect(scanned.status).toBe(403);

        expect((await confirmEmail(email)).ok).toBe(true);
        const token = await signIn(email);
        const me = await api<Api.Me>("GET", "/api/v1/me", undefined, token);
        expect(me.body).toMatchObject({
            role: "user",
            user: { email },
            limits: { aliases: 3, sendsPerDay: 2 },
        });

        // The verified account email is a ready-to-use destination.
        const destinations = await api<Api.Destination[]>(
            "GET",
            "/api/v1/destinations",
            undefined,
            token,
        );
        expect(destinations.body).toMatchObject([{ email, verified: true }]);
    });

    it("refuses sign-ups when they are closed, except for admin emails", async () => {
        const closed = { env: { PUBLIC_SIGNUPS: "false" } };
        const refused = await request(
            "POST",
            "/api/auth/sign-up/email",
            { email: "late@user.test", password: PASSWORD, name: "Late" },
            closed,
        );
        // Answered like a success (no account enumeration), but nothing happens.
        expect(refused.ok).toBe(true);
        expect(lastMailTo("late@user.test")).toBeUndefined();
        const late = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
            .bind("late@user.test")
            .first();
        expect(late).toBeNull();

        const admin = await request(
            "POST",
            "/api/auth/sign-up/email",
            { email: "boss@admin.test", password: PASSWORD, name: "Boss" },
            closed,
        );
        expect(admin.ok).toBe(true);
        // Not an admin while anyone could have signed up with the address.
        const unconfirmed = await env.DB.prepare("SELECT role FROM user WHERE email = ?")
            .bind("boss@admin.test")
            .first<{ role: string }>();
        expect(unconfirmed?.role).toBe("user");

        await confirmEmail("boss@admin.test");
        const token = await signIn("boss@admin.test");
        const me = await api<Api.Me>("GET", "/api/v1/me", undefined, token);
        expect(me.body).toMatchObject({ role: "admin", limits: null });
    });

    it("forgets sign-ups nobody confirmed within a day", async () => {
        await request("POST", "/api/auth/sign-up/email", {
            email: "ghost@user.test",
            password: PASSWORD,
            name: "Ghost",
        });
        const exists = () =>
            env.DB.prepare("SELECT id FROM user WHERE email = ?").bind("ghost@user.test").first();
        await cleanup(env);
        expect(await exists()).not.toBeNull();
        await cleanup(env, new Date(Date.now() + 25 * 60 * 60 * 1000));
        expect(await exists()).toBeNull();
    });
});

describe("account emails on the Worker's own domains", () => {
    it("are no destination, so nothing forwards back into the Worker", async () => {
        await api("POST", "/api/v1/domains", { name: "own.test" });
        const token = await signUp("me@own.test");
        const destinations = await api<Api.Destination[]>(
            "GET",
            "/api/v1/destinations",
            undefined,
            token,
        );
        expect(destinations.body).toEqual([]);
    });
});

describe("magic links", () => {
    it("sign in, and only mail strangers when sign-ups are open", async () => {
        const closed = { env: { PUBLIC_SIGNUPS: "false" } };
        const ask = (email: string) =>
            request("POST", "/api/auth/sign-in/magic-link", { email }, closed);

        expect((await ask("stranger@user.test")).ok).toBe(true);
        expect(lastMailTo("stranger@user.test")).toBeUndefined();

        await signUp("member@user.test");
        expect((await ask("member@user.test")).ok).toBe(true);
        const link = linkIn(lastMailTo("member@user.test"));
        const landing = await request("GET", link);
        // Back to the app, signed in with a cookie the app trades for a token.
        expect(landing.status).toBe(302);
        const cookie = landing.headers.get("set-cookie")!.split(";")[0]!;
        const session = await request("GET", "/api/auth/get-session", undefined, {
            headers: { Cookie: cookie },
        });
        const { session: s } = await session.json<{ session: { token: string } }>();
        const me = await api<Api.Me>("GET", "/api/v1/me", undefined, s.token);
        expect(me.body.user?.email).toBe("member@user.test");
        // Links work once.
        expect((await request("GET", link)).headers.get("location")).toContain("error");
    });
});

describe("an account's data", () => {
    it("sees shared domains only and keeps its aliases to itself", async () => {
        const shared = await sharedDomain("shared.test");
        await api("POST", "/api/v1/domains", { name: "private.test" });
        const alice = await signUp("alice@user.test");
        const bob = await signUp("bob@user.test");

        const domains = await api<Api.Domain[]>("GET", "/api/v1/domains", undefined, alice);
        expect(domains.body.map((d) => d.name)).toEqual(["shared.test"]);
        expect((await api("POST", "/api/v1/domains", { name: "mine.test" }, alice)).status).toBe(
            403,
        );
        expect(
            (await api("PATCH", `/api/v1/domains/${shared.id}`, { shared: false }, alice)).status,
        ).toBe(403);

        const onPrivate = await api<Api.ApiError>(
            "POST",
            "/api/v1/aliases",
            { address: "a@private.test", destination: "alice@user.test" },
            alice,
        );
        expect(onPrivate.body.error.code).toBe("unknown_domain");

        const created = await api<Api.Alias>(
            "POST",
            "/api/v1/aliases",
            { address: "alice@shared.test", destination: "alice@user.test" },
            alice,
        );
        expect(created.status).toBe(201);

        // Neither another account nor the admin token see or change it.
        for (const other of [bob, undefined]) {
            const list = await api<Api.Alias[]>("GET", "/api/v1/aliases", undefined, other);
            expect(list.body.map((a) => a.id)).not.toContain(created.body.id);
            const id = created.body.id;
            expect(
                (await api("PATCH", `/api/v1/aliases/${id}`, { enabled: false }, other)).status,
            ).toBe(404);
            expect((await api("DELETE", `/api/v1/aliases/${id}`, undefined, other)).status).toBe(
                404,
            );
        }
        // Nor can another account forward to Alice's inbox.
        const borrowed = await api<Api.ApiError>(
            "POST",
            "/api/v1/aliases",
            { address: "bob@shared.test", destination: "alice@user.test" },
            bob,
        );
        expect(borrowed.body.error.code).toBe("unknown_destination");
    });

    it("verifies new destinations by email before aliases can use them", async () => {
        await sharedDomain("verify.test");
        const carol = await signUp("carol@user.test");
        const added = await api<Api.Destination>(
            "POST",
            "/api/v1/destinations",
            { email: "Carol@Other.test" },
            carol,
        );
        expect(added.body).toMatchObject({ email: "carol@other.test", verified: false });

        const early = await api<Api.ApiError>(
            "POST",
            "/api/v1/aliases",
            { address: "c@verify.test", destination: "carol@other.test" },
            carol,
        );
        expect(early.body.error.code).toBe("unverified_destination");
        // A second link right away is refused.
        const resend = await api(
            "POST",
            `/api/v1/destinations/${added.body.id}/verify`,
            undefined,
            carol,
        );
        expect(resend.status).toBe(429);

        // The link opens the app, which confirms with a POST.
        const link = new URL(linkIn(lastMailTo("carol@other.test")));
        expect(link.pathname).toBe("/verify-destination");
        const token = link.searchParams.get("token");
        const confirm = (body: unknown) => request("POST", "/api/verify-destination", body);
        expect((await confirm({ token: `${token}x` })).status).toBe(400);
        expect((await confirm({ token })).status).toBe(200);
        // Links work once.
        expect((await confirm({ token })).status).toBe(400);

        const created = await api(
            "POST",
            "/api/v1/aliases",
            { address: "c@verify.test", destination: "carol@other.test" },
            carol,
        );
        expect(created.status).toBe(201);
    });

    it("enforces the alias limit", async () => {
        await sharedDomain("limit.test");
        const dave = await signUp("dave@user.test");
        for (const name of ["one", "two", "three", "four"]) {
            const { status, body } = await api<Api.ApiError>(
                "POST",
                "/api/v1/aliases",
                { address: `${name}@limit.test`, destination: "dave@user.test" },
                dave,
            );
            if (name === "four") expect(body.error.code).toBe("limit_reached");
            else expect(status).toBe(201);
        }
    });
});

describe("sessions", () => {
    it("hands other apps a session of their own, and signs out one at a time", async () => {
        const app = await signUp("frank@user.test");
        const created = await api<Api.NewSession>(
            "POST",
            "/api/v1/sessions",
            { redirectUri: EXTENSION_REDIRECT },
            app,
        );
        expect(created.status).toBe(201);
        const extension = created.body.token;
        expect(extension).not.toBe(app);

        const me = await api<Api.Me>("GET", "/api/v1/me", undefined, extension);
        expect(me.body.user?.email).toBe("frank@user.test");

        // Signing the extension out leaves the app signed in.
        expect((await api("DELETE", "/api/v1/session", undefined, extension)).status).toBe(204);
        expect((await api("GET", "/api/v1/me", undefined, extension)).status).toBe(401);
        expect((await api("GET", "/api/v1/me", undefined, app)).status).toBe(200);

        // The admin token is no account: nothing to hand out, nothing to sign out.
        expect(
            (await api("POST", "/api/v1/sessions", { redirectUri: EXTENSION_REDIRECT })).status,
        ).toBe(400);
        expect((await api("DELETE", "/api/v1/session")).status).toBe(204);
        expect((await api("GET", "/api/v1/me")).status).toBe(200);
    });
});

describe("self-service", () => {
    it("lists signed-in devices, naming the extension's session", async () => {
        const app = await signUp("grace@user.test");
        await api("POST", "/api/v1/sessions", { redirectUri: EXTENSION_REDIRECT }, app);
        const response = await request("GET", "/api/auth/list-sessions", undefined, {
            headers: { Authorization: `Bearer ${app}` },
        });
        const sessions = await response.json<{ userAgent: string | null }[]>();
        // Signing up signs in through the confirmation link, too.
        expect(sessions.map((s) => s.userAgent)).toContain("Mailflare extension");
    });

    it("deletes an account with its aliases and inboxes", async () => {
        await sharedDomain("leave.test");
        const token = await signUp("heidi@user.test");
        const alias = await api<Api.Alias>(
            "POST",
            "/api/v1/aliases",
            { address: "heidi@leave.test", destination: "heidi@user.test" },
            token,
        );
        expect(alias.status).toBe(201);

        const deleted = await request(
            "POST",
            "/api/auth/delete-user",
            { password: PASSWORD },
            { headers: { Authorization: `Bearer ${token}` } },
        );
        expect(deleted.ok).toBe(true);

        expect((await api("GET", "/api/v1/me", undefined, token)).status).toBe(401);
        const left = await env.DB.prepare(
            "SELECT (SELECT count(*) FROM aliases WHERE address = ?) AS aliases, (SELECT count(*) FROM destinations WHERE email = ?) AS inboxes",
        )
            .bind("heidi@leave.test", "heidi@user.test")
            .first<{ aliases: number; inboxes: number }>();
        expect(left).toEqual({ aliases: 0, inboxes: 0 });
    });
});

describe("admins", () => {
    it("list accounts and can suspend them", async () => {
        const eve = await signUp("eve@user.test");
        const users = await api<Api.User[]>("GET", "/api/v1/users");
        const record = users.body.find((u) => u.email === "eve@user.test")!;
        expect(record).toMatchObject({ role: "user", banned: false, emailVerified: true });
        expect((await api("GET", "/api/v1/users", undefined, eve)).status).toBe(403);

        const banned = await api<Api.User>("PATCH", `/api/v1/users/${record.id}`, { banned: true });
        expect(banned.body.banned).toBe(true);
        // Signed out everywhere, and sign-in is refused.
        expect((await api("GET", "/api/v1/me", undefined, eve)).status).toBe(401);
        const again = await request("POST", "/api/auth/sign-in/email", {
            email: "eve@user.test",
            password: PASSWORD,
        });
        expect(again.ok).toBe(false);

        const sessions = await env.DB.prepare("SELECT count(*) AS n FROM session WHERE user_id = ?")
            .bind(record.id)
            .first<{ n: number }>();
        expect(sessions?.n).toBe(0);
    });
});

describe("rate limits", () => {
    it("throttles repeated sign-in attempts from one client", async () => {
        const headers = { "cf-connecting-ip": "203.0.113.7" };
        const statuses: number[] = [];
        for (let i = 0; i < 5; i += 1) {
            const response = await request(
                "POST",
                "/api/auth/sign-in/email",
                { email: "nobody@user.test", password: "wrong password!" },
                { headers },
            );
            statuses.push(response.status);
        }
        expect(statuses).toContain(429);
    });
});

describe("account security", () => {
    it("hands sessions only to known extensions, no fresher than the session asking", async () => {
        const app = await signUp("ivan@user.test");
        const ask = (redirectUri: string, options?: { env?: Partial<Env> }) =>
            api<Api.NewSession>("POST", "/api/v1/sessions", { redirectUri }, app, options);

        expect((await ask("https://evil.test/")).status).toBe(400);
        expect(
            (await ask("https://bcdefghijklmnopabcdefghijklmnopa.chromiumapp.org/")).status,
        ).toBe(400);
        const firefox = await redirectHost("{f0bdc9fa-a062-4424-baee-16530c53aa06}");
        expect((await ask(`https://${firefox}/`)).status).toBe(201);
        // Development builds, once the Worker allows them.
        const dev = "https://bcdefghijklmnopabcdefghijklmnopa.chromiumapp.org/";
        const allowed = await ask(dev, {
            env: { EXTENSION_IDS: "bcdefghijklmnopabcdefghijklmnopa" },
        });
        expect(allowed.status).toBe(201);

        // Bearer tokens from sign-ins carry a signature after the session token.
        const createdAt = (token: string) =>
            env.DB.prepare("SELECT created_at AS at FROM session WHERE token = ?")
                .bind(token.split(".")[0])
                .first<{ at: number }>();
        expect((await createdAt(allowed.body.token))?.at).toBe((await createdAt(app))?.at);
    });

    it("accepts bearer tokens only, not the session cookie", async () => {
        await signUp("judy@user.test");
        const response = await request("POST", "/api/auth/sign-in/email", {
            email: "judy@user.test",
            password: PASSWORD,
        });
        const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
        const me = await request("GET", "/api/v1/me", undefined, { headers: { Cookie: cookie } });
        expect(me.status).toBe(401);
    });

    it("signs out every session when the password is reset", async () => {
        const token = await signUp("kim@user.test");
        await request("POST", "/api/auth/request-password-reset", {
            email: "kim@user.test",
            redirectTo: "/reset-password",
        });
        const resetLink = new URL(linkIn(lastMailTo("kim@user.test")));
        const resetToken = resetLink.pathname.split("/").pop()!;
        const reset = await request("POST", "/api/auth/reset-password", {
            token: resetToken,
            newPassword: "another long password",
        });
        expect(reset.ok).toBe(true);
        expect((await api("GET", "/api/v1/me", undefined, token)).status).toBe(401);
    });

    it("keeps better-auth's admin endpoints closed, even to admins", async () => {
        const victim = await signUp("leo@user.test");
        const { body: me } = await api<Api.Me>("GET", "/api/v1/me", undefined, victim);
        const admin = await signUp("mallory@user.test");
        await env.DB.prepare("UPDATE user SET role = 'admin' WHERE email = ?")
            .bind("mallory@user.test")
            .run();
        const impersonate = await request(
            "POST",
            "/api/auth/admin/impersonate-user",
            { userId: me.user!.id },
            { headers: { Authorization: `Bearer ${admin}` } },
        );
        expect(impersonate.status).toBe(404);
    });
});

describe("addresses on shared domains", () => {
    it("are not available for reserved mailboxes, except to admins", async () => {
        await sharedDomain("reserved.test");
        const token = await signUp("nina@user.test");
        for (const local of ["postmaster", "admin", "webmaster", "mailflare", "accounts"]) {
            const { status } = await api(
                "POST",
                "/api/v1/aliases",
                { address: `${local}@reserved.test`, destination: "nina@user.test" },
                token,
            );
            // accounts@ is the MAIL_FROM sender in the tests.
            expect(status, local).toBe(400);
        }
        await api("POST", "/api/v1/destinations", { email: "ops@inbox.test" });
        const admin = await api("POST", "/api/v1/aliases", {
            address: "postmaster@reserved.test",
            destination: "ops@inbox.test",
        });
        expect(admin.status).toBe(201);
    });

    it("stay with their owner after the alias is deleted", async () => {
        await sharedDomain("retire.test");
        const olga = await signUp("olga@user.test");
        const paul = await signUp("paul@user.test");
        const create = (token: string, destination: string) =>
            api<Api.Alias>(
                "POST",
                "/api/v1/aliases",
                { address: "shop@retire.test", destination },
                token,
            );

        const alias = await create(olga, "olga@user.test");
        expect(
            (await api("DELETE", `/api/v1/aliases/${alias.body.id}`, undefined, olga)).status,
        ).toBe(204);
        expect((await create(paul, "paul@user.test")).status).toBe(409);
        expect((await create(olga, "olga@user.test")).status).toBe(201);
    });

    it("of deleted accounts stay reserved too", async () => {
        await sharedDomain("gone.test");
        const quinn = await signUp("quinn@user.test");
        await api(
            "POST",
            "/api/v1/aliases",
            { address: "quinn@gone.test", destination: "quinn@user.test" },
            quinn,
        );
        await request(
            "POST",
            "/api/auth/delete-user",
            { password: PASSWORD },
            { headers: { Authorization: `Bearer ${quinn}` } },
        );
        const rita = await signUp("rita@user.test");
        const taken = await api(
            "POST",
            "/api/v1/aliases",
            { address: "quinn@gone.test", destination: "rita@user.test" },
            rita,
        );
        expect(taken.status).toBe(409);
    });
});

describe("confirmation emails", () => {
    it("are limited per inbox, however often it is added and deleted", async () => {
        const token = await signUp("sam@user.test");
        const statuses = [];
        for (let i = 0; i < 4; i += 1) {
            const added = await api<Api.Destination>(
                "POST",
                "/api/v1/destinations",
                { email: "victim@elsewhere.test" },
                token,
            );
            statuses.push(added.status);
            if (added.status === 201) {
                await api("DELETE", `/api/v1/destinations/${added.body.id}`, undefined, token);
            }
        }
        expect(statuses).toEqual([201, 201, 201, 429]);
    });
});
