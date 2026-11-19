import { env } from "cloudflare:workers";
import { describe, expect, it } from "vitest";

import { cleanup } from "../src/cleanup";
import { signUp } from "./helpers";

const HOUR = 60 * 60 * 1000;

async function ids(table: string, column = "id") {
    const { results } = await env.DB.prepare(`SELECT ${column} AS id FROM ${table}`).all<{
        id: string;
    }>();
    return results.map((r) => r.id);
}

describe("daily cleanup", () => {
    it("deletes expired links, sessions and old counters, and keeps the rest", async () => {
        const now = Date.now();
        await signUp("tidy@user.test");
        const user = await env.DB.prepare("SELECT id FROM user WHERE email = ?")
            .bind("tidy@user.test")
            .first<{ id: string }>();
        const sql = (query: string, ...values: unknown[]) => env.DB.prepare(query).bind(...values);

        await env.DB.batch([
            sql("DELETE FROM verification"),
            sql("DELETE FROM rate_limit"),
            sql(
                "INSERT INTO verification (id, identifier, value, expires_at, created_at, updated_at) VALUES ('v-old', 'a', 'b', ?1, ?1, ?1), ('v-new', 'c', 'd', ?2, ?1, ?1)",
                now - HOUR,
                now + HOUR,
            ),
            sql(
                "INSERT INTO session (id, token, user_id, expires_at, created_at, updated_at) VALUES ('s-old', 't-old', ?1, ?2, ?2, ?2)",
                user!.id,
                now - HOUR,
            ),
            sql(
                "INSERT INTO rate_limit (id, key, count, last_request) VALUES ('r-old', 'k1', 1, ?1), ('r-new', 'k2', 1, ?2)",
                now - 2 * 24 * HOUR,
                now - HOUR,
            ),
            sql(
                "INSERT INTO send_usage (user_id, day, count) VALUES (?1, '2020-01-01', 3), (?1, ?2, 1)",
                user!.id,
                new Date(now).toISOString().slice(0, 10),
            ),
        ]);

        await cleanup(env, new Date(now));

        expect(await ids("verification")).toEqual(["v-new"]);
        const sessions = await ids("session");
        expect(sessions).not.toContain("s-old");
        // The session signing up created is still valid.
        expect(sessions.length).toBeGreaterThan(0);
        expect(await ids("rate_limit")).toEqual(["r-new"]);
        expect(await ids("send_usage", "day")).toEqual([new Date(now).toISOString().slice(0, 10)]);
    });
});
