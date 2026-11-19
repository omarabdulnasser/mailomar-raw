import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { describe, expect, it, vi } from "vitest";

import { createDb, schema } from "../src/db";
import {
    ALIAS_HEADER,
    handleEmail,
    LOOP_REASON,
    MAX_ALIAS_HOPS,
    MAX_CONTACTS_PER_MESSAGE,
    REJECT_REASON,
} from "../src/email";
import { api, seedAlias } from "./helpers";

type Alias = {
    id: string;
    forwardedCount: number;
    blockedCount: number;
    sentCount: number;
    lastEmailAt: number | null;
};

const OWNER = "me@inbox.test";

/** Cloudflare's verdict, as the topmost Authentication-Results header. */
const cloudflarePass = (domain: string) =>
    `Authentication-Results: mx.cloudflare.net; dkim=pass header.d=${domain}; dmarc=pass header.from=${domain}; spf=pass smtp.mailfrom=${domain}`;

function rawMessage(headers: string[], body = "Hello") {
    return [...headers, "Subject: Hi", "Message-ID: <1@test>", "", body].join("\r\n");
}

/** A stand-in for Cloudflare's incoming message, recording what the Worker does with it. */
function incoming(options: { to: string; from: string; headers?: string[] }) {
    // Cloudflare's own headers come first, as the receiving server prepends them.
    const raw = rawMessage([
        ...(options.headers ?? []),
        `From: ${options.from}`,
        `To: ${options.to}`,
    ]);
    return {
        from: options.from,
        to: options.to,
        headers: new Headers(),
        raw: new Response(raw).body!,
        rawSize: raw.length,
        canBeForwarded: true,
        setReject: vi.fn(),
        forward: vi.fn(async () => ({ messageId: "forwarded" })),
        reply: vi.fn(),
    } satisfies ForwardableEmailMessage;
}

type Sent = { from: string; to: string };

/** env with a recording EMAIL binding (or a failing one, or none). */
function testEnv(mode: "ok" | "fail" | "missing" = "ok") {
    const sent: Sent[] = [];
    const send = vi.fn(async (message: EmailMessage) => {
        if (mode === "fail") throw Object.assign(new Error("boom"), { code: "E_DELIVERY_FAILED" });
        sent.push({ from: message.from, to: message.to });
        return { messageId: "sent" };
    });
    const EMAIL = mode === "missing" ? undefined : ({ send } as unknown as SendEmail);
    return { env: { ...env, EMAIL }, sent };
}

async function receive(message: ReturnType<typeof incoming>, mode?: "ok" | "fail" | "missing") {
    const test = testEnv(mode);
    const ctx = createExecutionContext();
    await handleEmail(message, test.env, ctx);
    await waitOnExecutionContext(ctx);
    return { message, sent: test.sent };
}

async function getAlias(id: string) {
    const { body } = await api<Alias[]>("GET", "/api/v1/aliases");
    return body.find((a) => a.id === id)!;
}

async function reverseKeyFor(email: string) {
    const row = await env.DB.prepare("SELECT key FROM reverse_contacts WHERE email = ?")
        .bind(email)
        .first<{ key: string }>();
    return row?.key ?? null;
}

describe("incoming mail", () => {
    it("re-sends mail to the destination, from the alias", async () => {
        const alias = await seedAlias("shop@in.test", OWNER);
        const { message, sent } = await receive(
            incoming({ to: "shop@in.test", from: "bob@elsewhere.test" }),
        );
        expect(message.setReject).not.toHaveBeenCalled();
        expect(message.forward).not.toHaveBeenCalled();
        expect(sent).toEqual([{ from: "shop@in.test", to: OWNER }]);
        const stored = await getAlias(alias.id);
        expect(stored.forwardedCount).toBe(1);
        expect(stored.lastEmailAt).not.toBeNull();
    });

    it("forwards unchanged when re-sending fails or isn't configured", async () => {
        await seedAlias("fallback@in.test", OWNER);
        for (const mode of ["fail", "missing"] as const) {
            const { message, sent } = await receive(
                incoming({ to: "fallback@in.test", from: "bob@elsewhere.test" }),
                mode,
            );
            expect(sent).toEqual([]);
            expect(message.forward).toHaveBeenCalledOnce();
            const [recipient, headers] = message.forward.mock.calls[0] as unknown as [
                string,
                Headers,
            ];
            expect(recipient).toBe(OWNER);
            expect(headers.get(ALIAS_HEADER)).toBe("fallback@in.test");
        }
    });

    it("matches recipients case-insensitively and delivers subaddresses", async () => {
        await seedAlias("news@case.test", OWNER);
        for (const to of ["News@CASE.test", "news+promo@case.test"]) {
            const { sent } = await receive(incoming({ to, from: "bob@elsewhere.test" }));
            expect(sent).toEqual([{ from: "news@case.test", to: OWNER }]);
        }
    });

    it("rejects unknown and disabled aliases alike, counting blocked mail", async () => {
        const alias = await seedAlias("paused@reject.test", OWNER);
        await api("PATCH", `/api/v1/aliases/${alias.id}`, { enabled: false });

        for (const to of ["nobody@reject.test", "paused@reject.test"]) {
            const { message, sent } = await receive(incoming({ to, from: "bob@elsewhere.test" }));
            expect(sent).toEqual([]);
            expect(message.forward).not.toHaveBeenCalled();
            expect(message.setReject).toHaveBeenCalledWith(REJECT_REASON);
        }
        expect((await getAlias(alias.id)).blockedCount).toBe(1);
    });

    it("stores a short reverse key for contacts whose readable reverse address is too long", async () => {
        await seedAlias("keyed@long.test", OWNER);
        const contact = `${"a".repeat(50)}@elsewhere.test`;
        await receive(incoming({ to: "keyed@long.test", from: contact }));
        expect(await reverseKeyFor(contact)).toMatch(/^[a-z0-9]{10}$/);
        // The same contact keeps its key.
        const key = await reverseKeyFor(contact);
        await receive(incoming({ to: "keyed@long.test", from: contact }));
        expect(await reverseKeyFor(contact)).toBe(key);
    });

    it("keep the short form of a long alias within the local-part limit", async () => {
        // The API allows 64 characters, but the reverse address adds "+=" and a key.
        const address = "z".repeat(55) + "@long.test";
        const alias = await seedAlias(address, OWNER);
        const contact = "long-contact@elsewhere.test";
        await receive(incoming({ to: address, from: contact }));

        // 55 characters leave 7 for the key, so the reply address is exactly 64.
        const key = await reverseKeyFor(contact);
        expect(key).toMatch(/^[a-z0-9]{7}$/);
        const replyTo = address.split("@")[0] + "+=" + key + "@long.test";
        expect(replyTo.split("@")[0]?.length).toBe(64);

        const { message, sent } = await receive(
            incoming({ to: replyTo, from: OWNER, headers: [cloudflarePass("inbox.test")] }),
        );
        expect(message.setReject).not.toHaveBeenCalled();
        expect(sent).toEqual([{ from: address, to: contact }]);
        expect((await getAlias(alias.id)).sentCount).toBe(1);
    });

    it("replace a key stored for a long alias before the limit applied", async () => {
        const address = "y".repeat(55) + "@long.test";
        const alias = await seedAlias(address, OWNER);
        const contact = "old-contact@elsewhere.test";
        // What the alias stored before the fix: a 10-character key, too long to use.
        await env.DB.prepare(
            "INSERT INTO reverse_contacts (key, alias_id, email, replyable, created_at) VALUES (?, ?, ?, 1, ?)",
        )
            .bind("abcdefghij", alias.id, contact, Math.floor(Date.now() / 1000))
            .run();

        await receive(incoming({ to: address, from: contact }));

        // The next message shrinks the stored key, so the short form fits again.
        const key = await reverseKeyFor(contact);
        expect(key).toMatch(/^[a-z0-9]{7}$/);
        const replyTo = address.split("@")[0] + "+=" + key + "@long.test";
        const { sent } = await receive(
            incoming({ to: replyTo, from: OWNER, headers: [cloudflarePass("inbox.test")] }),
        );
        expect(sent).toEqual([{ from: address, to: contact }]);
    });

    it("retry with a fresh key when another contact already owns it", async () => {
        const address = "w".repeat(56) + "@long.test";
        const alias = await seedAlias(address, OWNER);
        // Six characters is all this alias leaves, and this key is already taken.
        await env.DB.prepare(
            "INSERT INTO reverse_contacts (key, alias_id, email, replyable, created_at) VALUES (?, ?, ?, 1, ?)",
        )
            .bind("aaaaaa", alias.id, "already@elsewhere.test", Math.floor(Date.now() / 1000))
            .run();

        // The first key generated is all "a"s, so the insert hits the taken key once.
        const realRandom = crypto.getRandomValues.bind(crypto);
        let first = true;
        const spy = vi.spyOn(crypto, "getRandomValues").mockImplementation((array) => {
            if (first) {
                first = false;
                if (array) (array as Uint8Array).fill(0);
                return array;
            }
            return realRandom(array as Uint8Array);
        });

        const contact = "new-contact@elsewhere.test";
        try {
            const { message, sent } = await receive(incoming({ to: address, from: contact }));

            // A duplicate key must not send the message down the forwarding fallback.
            expect(message.forward).not.toHaveBeenCalled();
            expect(sent).toEqual([{ from: address, to: OWNER }]);
        } finally {
            spy.mockRestore();
        }
        const key = await reverseKeyFor(contact);
        expect(key).toMatch(/^[a-z0-9]{6}$/);
        expect(key).not.toBe("aaaaaa");
    });
});

describe("mail loops", () => {
    it("refuse mail that already passed through the alias", async () => {
        const alias = await seedAlias("circle@loop.test", OWNER);
        const { message, sent } = await receive(
            incoming({
                to: "circle@loop.test",
                from: "circle@loop.test",
                headers: [
                    `${ALIAS_HEADER}: other@elsewhere.test`,
                    `${ALIAS_HEADER}: Circle@loop.test`,
                ],
            }),
        );
        expect(sent).toEqual([]);
        expect(message.forward).not.toHaveBeenCalled();
        expect(message.setReject).toHaveBeenCalledWith(LOOP_REASON);
        expect((await getAlias(alias.id)).blockedCount).toBe(1);
    });

    it("let mail pass a few aliases in a row, but not too many", async () => {
        await seedAlias("chain@loop.test", OWNER);
        const hops = (n: number) =>
            Array.from({ length: n }, (_, i) => `${ALIAS_HEADER}: hop${i}@elsewhere.test`);

        const chained = await receive(
            incoming({ to: "chain@loop.test", from: "bob@elsewhere.test", headers: hops(1) }),
        );
        expect(chained.sent).toEqual([{ from: "chain@loop.test", to: OWNER }]);

        const tooLong = await receive(
            incoming({
                to: "chain@loop.test",
                from: "bob@elsewhere.test",
                headers: hops(MAX_ALIAS_HOPS),
            }),
        );
        expect(tooLong.sent).toEqual([]);
        expect(tooLong.message.setReject).toHaveBeenCalledWith(LOOP_REASON);
    });
});

describe("sending from an alias", () => {
    it("sends the owner's message to the contact behind a reverse address", async () => {
        const alias = await seedAlias("reply@out.test", OWNER);
        const { message, sent } = await receive(
            incoming({
                to: "reply+Bob.Smith=Shop.test@out.test",
                from: OWNER,
                headers: [cloudflarePass("inbox.test")],
            }),
        );
        expect(message.setReject).not.toHaveBeenCalled();
        // The contact's local part keeps its case; the domain is lowercased.
        expect(sent).toEqual([{ from: "reply@out.test", to: "Bob.Smith@shop.test" }]);
        expect((await getAlias(alias.id)).sentCount).toBe(1);
    });

    it("resolves short reverse keys", async () => {
        await seedAlias("short@out.test", OWNER);
        const contact = `${"b".repeat(50)}@elsewhere.test`;
        await receive(incoming({ to: "short@out.test", from: contact }));

        const { sent } = await receive(
            incoming({
                to: `short+=${await reverseKeyFor(contact)}@out.test`,
                from: OWNER,
                headers: [cloudflarePass("inbox.test")],
            }),
        );
        expect(sent).toEqual([{ from: "short@out.test", to: contact }]);
    });

    it("doesn't send mail claiming to be from the owner without Cloudflare's DMARC pass", async () => {
        await seedAlias("guard@out.test", OWNER);
        const attempts = [
            [], // No authentication results at all.
            ["Authentication-Results: mx.cloudflare.net; dmarc=fail header.from=inbox.test"],
            // A forged pass below a different topmost result.
            ["Authentication-Results: other.example; dmarc=none", cloudflarePass("inbox.test")],
            // A pass for a different domain.
            [cloudflarePass("evil.test")],
        ];
        for (const headers of attempts) {
            const { message, sent } = await receive(
                incoming({ to: "guard+victim=target.test@out.test", from: OWNER, headers }),
            );
            // Handled like anyone's mail to the alias: a distinct answer would
            // tell whoever guessed the owner's address that the guess is right.
            expect(sent).toEqual([{ from: "guard@out.test", to: OWNER }]);
            expect(message.setReject).not.toHaveBeenCalled();
        }
    });

    it("gives sent mail a Message-ID of the alias's domain, remembering the owner's", async () => {
        const alias = await seedAlias("thread@out.test", OWNER);
        await receive(
            incoming({
                to: "thread+bob=shop.test@out.test",
                from: OWNER,
                headers: [cloudflarePass("inbox.test")],
            }),
        );
        const row = await env.DB.prepare("SELECT id, original FROM message_ids WHERE alias_id = ?")
            .bind(alias.id)
            .first<{ id: string; original: string }>();
        expect(row?.original).toBe("<1@test>");
        expect(row?.id).toMatch(/^<[a-z0-9]+@out\.test>$/);
    });

    it("treats anyone else writing to a reverse address as mail for the alias", async () => {
        await seedAlias("stranger@out.test", OWNER);
        const { sent } = await receive(
            incoming({
                to: "stranger+victim=target.test@out.test",
                from: "attacker@evil.test",
                headers: [cloudflarePass("evil.test")],
            }),
        );
        expect(sent).toEqual([{ from: "stranger@out.test", to: OWNER }]);
    });

    it("refuses to send from a disabled alias", async () => {
        const alias = await seedAlias("off@out.test", OWNER);
        await api("PATCH", `/api/v1/aliases/${alias.id}`, { enabled: false });
        const { message, sent } = await receive(
            incoming({
                to: "off+bob=shop.test@out.test",
                from: OWNER,
                headers: [cloudflarePass("inbox.test")],
            }),
        );
        expect(sent).toEqual([]);
        expect(message.setReject).toHaveBeenCalledWith("This alias is disabled");
    });
});

/** An alias owned by an account (role "user" unless given), straight in the database. */
async function seedAccountAlias(address: string, owner: string, role = "user") {
    const db = createDb(env.DB);
    const domainName = address.split("@")[1]!;
    const [user] = await db
        .insert(schema.user)
        .values({ id: crypto.randomUUID(), name: owner, email: owner, emailVerified: true, role })
        .returning();
    const [domain] = await db
        .insert(schema.domains)
        .values({ name: domainName, shared: true })
        .onConflictDoUpdate({ target: schema.domains.name, set: { shared: true } })
        .returning();
    const [destination] = await db
        .insert(schema.destinations)
        .values({ userId: user!.id, email: owner, verifiedAt: new Date() })
        .returning();
    const [alias] = await db
        .insert(schema.aliases)
        .values({ address, userId: user!.id, domainId: domain!.id, destinationId: destination!.id })
        .returning();
    return { alias: alias!, user: user!, destination: destination! };
}

describe("aliases of accounts", () => {
    const fromOwner = (owner: string, to: string) =>
        incoming({ to, from: owner, headers: [cloudflarePass(owner.split("@")[1]!)] });

    it("only send to people who mailed the alias", async () => {
        const owner = "ann@acct.test";
        await seedAccountAlias("ann@shared.test", owner);

        const cold = await receive(fromOwner(owner, "ann+stranger=target.test@shared.test"));
        expect(cold.sent).toEqual([]);
        expect(cold.message.setReject).toHaveBeenCalledWith(
            "You can only reply to people who have emailed this alias",
        );

        // Once they have written, replies go out; not to others in Cc, or
        // anyone could make an address a contact.
        await receive(
            incoming({
                to: "ann@shared.test",
                from: "Stranger@Target.test",
                headers: [cloudflarePass("target.test"), "Cc: friend@elsewhere.test"],
            }),
        );
        const reply = await receive(fromOwner(owner, "ann+stranger=target.test@shared.test"));
        expect(reply.message.setReject).not.toHaveBeenCalled();
        expect(reply.sent).toHaveLength(1);
        const cc = await receive(fromOwner(owner, "ann+friend=elsewhere.test@shared.test"));
        expect(cc.sent).toEqual([]);
    });

    it("don't count senders Cloudflare couldn't authenticate as contacts", async () => {
        const owner = "dan@acct.test";
        await seedAccountAlias("dan@shared.test", owner);
        // A forged From (no DMARC or aligned SPF pass), and the owner mailing
        // their own alias with a stranger as the sender.
        await receive(incoming({ to: "dan@shared.test", from: "victim@target.test" }));
        await receive(
            incoming({
                to: "dan@shared.test",
                from: "victim@target.test",
                headers: [
                    "Authentication-Results: mx.cloudflare.net; spf=pass smtp.mailfrom=me@throwaway.test; dmarc=none",
                ],
            }),
        );
        const { sent } = await receive(fromOwner(owner, "dan+victim=target.test@shared.test"));
        expect(sent).toEqual([]);
    });

    it("stop at the daily sending limit", async () => {
        const owner = "ben@acct.test";
        await seedAccountAlias("ben@shared.test", owner);
        await receive(
            incoming({
                to: "ben@shared.test",
                from: "pal@target.test",
                headers: [cloudflarePass("target.test")],
            }),
        );
        const results = [];
        for (let i = 0; i < 3; i += 1) {
            results.push(await receive(fromOwner(owner, "ben+pal=target.test@shared.test")));
        }
        // MAX_SENDS_PER_DAY is 2 in the tests.
        expect(results.map((r) => r.sent.length)).toEqual([1, 1, 0]);
        expect(results[2]!.message.setReject).toHaveBeenCalledWith(
            "You have reached today's sending limit",
        );
    });

    it("of admins have no contact restriction", async () => {
        const owner = "chief@acct.test";
        await seedAccountAlias("chief@shared.test", owner, "admin");
        const { sent } = await receive(fromOwner(owner, "chief+anyone=target.test@shared.test"));
        expect(sent).toEqual([{ from: "chief@shared.test", to: "anyone@target.test" }]);
    });

    it("receive nothing once the account is suspended or the inbox unconfirmed", async () => {
        const banned = await seedAccountAlias("gone@shared.test", "gone@acct.test");
        await env.DB.prepare("UPDATE user SET banned = 1 WHERE id = ?").bind(banned.user.id).run();
        const unconfirmed = await seedAccountAlias("new@shared.test", "new@acct.test");
        await env.DB.prepare("UPDATE destinations SET verified_at = NULL WHERE id = ?")
            .bind(unconfirmed.destination.id)
            .run();

        for (const to of ["gone@shared.test", "new@shared.test"]) {
            const { message, sent } = await receive(incoming({ to, from: "bob@elsewhere.test" }));
            expect(sent).toEqual([]);
            expect(message.forward).not.toHaveBeenCalled();
            expect(message.setReject).toHaveBeenCalledWith(REJECT_REASON);
        }
    });
});

describe("incoming mail, defensively", () => {
    it("delivers mail whose display name is a broken encoded word", async () => {
        await seedAlias("broken@out.test", OWNER);
        // Parsing the owner check would throw on the malformed base64 before.
        const { message, sent } = await receive(
            incoming({
                to: "broken+bob=shop.test@out.test",
                from: "=?UTF-8?B?!!!?= <bob@shop.test>",
                headers: [cloudflarePass("shop.test")],
            }),
        );
        expect(message.setReject).not.toHaveBeenCalled();
        expect(sent).toEqual([{ from: "broken@out.test", to: OWNER }]);
    });

    it("forwards mail without a sender (bounces) instead of re-sending it from the alias", async () => {
        await seedAlias("bounce@out.test", OWNER);
        const { message, sent } = await receive(incoming({ to: "bounce@out.test", from: "" }));
        expect(sent).toEqual([]);
        expect(message.forward).toHaveBeenCalledOnce();
    });

    it(`gives at most ${MAX_CONTACTS_PER_MESSAGE} addresses of a message reverse addresses`, async () => {
        const alias = await seedAlias("crowd@out.test", OWNER);
        const cc = Array.from({ length: 80 }, (_, i) => `p${i}@many.test`).join(", ");
        const { sent } = await receive(
            incoming({ to: "crowd@out.test", from: "host@many.test", headers: [`Cc: ${cc}`] }),
        );
        expect(sent).toHaveLength(1);
        const row = await env.DB.prepare(
            "SELECT count(*) AS n FROM reverse_contacts WHERE alias_id = ?",
        )
            .bind(alias.id)
            .first<{ n: number }>();
        expect(row?.n).toBe(MAX_CONTACTS_PER_MESSAGE);
    });
});
