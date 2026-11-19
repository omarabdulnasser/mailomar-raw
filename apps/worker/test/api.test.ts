import { describe, expect, it } from "vitest";

import type * as Api from "../src/api/types";
import { api } from "./helpers";

describe("auth", () => {
    it("serves /api/info without a token", async () => {
        const { status, body } = await api<Api.ApiInfo>("GET", "/api/info", undefined, null);
        expect(status).toBe(200);
        expect(body).toEqual({
            name: "mailflare",
            apiVersion: 1,
            accounts: { enabled: true, publicSignups: true },
        });
    });

    it("rejects missing and wrong tokens", async () => {
        expect((await api("GET", "/api/v1/me", undefined, null)).status).toBe(401);
        expect((await api("GET", "/api/v1/me", undefined, "wrong")).status).toBe(401);
        const { status, body } = await api<Api.Me>("GET", "/api/v1/me");
        expect(status).toBe(200);
        expect(body.role).toBe("admin");
    });

    it("answers CORS preflights for any origin", async () => {
        const { exports } = await import("cloudflare:workers");
        const response = await exports.default.fetch(
            new Request("https://worker.test/api/v1/aliases", {
                method: "OPTIONS",
                headers: {
                    Origin: "chrome-extension://abc",
                    "Access-Control-Request-Method": "POST",
                    "Access-Control-Request-Headers": "authorization,content-type",
                },
            }),
        );
        expect(response.status).toBe(204);
        expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
});

describe("domains and destinations", () => {
    it("creates, lists and deletes domains, normalizing names", async () => {
        const created = await api<Api.Domain>("POST", "/api/v1/domains", {
            name: " Example.TEST ",
        });
        expect(created.status).toBe(201);
        expect(created.body.name).toBe("example.test");

        expect((await api("POST", "/api/v1/domains", { name: "example.test" })).status).toBe(409);
        expect((await api("POST", "/api/v1/domains", { name: "not a domain" })).status).toBe(400);

        const list = await api<Api.Domain[]>("GET", "/api/v1/domains");
        expect(list.body.map((d) => d.name)).toContain("example.test");

        expect((await api("DELETE", `/api/v1/domains/${created.body.id}`)).status).toBe(204);
        expect((await api("DELETE", `/api/v1/domains/${created.body.id}`)).status).toBe(404);
    });

    it("refuses destinations on the Worker's own domains (mail loop)", async () => {
        await api("POST", "/api/v1/domains", { name: "loop.test" });
        const { status, body } = await api<Api.ApiError>("POST", "/api/v1/destinations", {
            email: "me@loop.test",
        });
        expect(status).toBe(400);
        expect(body.error.code).toBe("mail_loop");

        await api("POST", "/api/v1/destinations", { email: "me@later.test" });
        const domain = await api<Api.ApiError>("POST", "/api/v1/domains", { name: "later.test" });
        expect(domain.status).toBe(400);
        expect(domain.body.error.code).toBe("mail_loop");
    });

    it("validates destination emails", async () => {
        const { status, body } = await api<Api.ApiError>("POST", "/api/v1/destinations", {
            email: "nope",
        });
        expect(status).toBe(400);
        expect(body.error.code).toBe("invalid_request");
    });
});

describe("aliases", () => {
    async function setup() {
        const domain = await api<Api.Domain>("POST", "/api/v1/domains", { name: "alias.test" });
        await api("POST", "/api/v1/destinations", { email: "one@inbox.test" });
        await api("POST", "/api/v1/destinations", { email: "two@inbox.test" });
        return domain.body;
    }

    it("runs the full create, list, update, delete cycle", async () => {
        const domain = await setup();

        const created = await api<Api.Alias>("POST", "/api/v1/aliases", {
            address: "Shop.2024@Alias.test",
            destination: "one@inbox.test",
            description: "Online shop",
        });
        expect(created.status).toBe(201);
        expect(created.body).toMatchObject({
            address: "shop.2024@alias.test",
            domainId: domain.id,
            destination: "one@inbox.test",
            description: "Online shop",
            enabled: true,
            forwardedCount: 0,
            blockedCount: 0,
            lastEmailAt: null,
        });

        const list = await api<Api.Alias[]>("GET", `/api/v1/aliases?domainId=${domain.id}`);
        expect(list.body.map((a) => a.id)).toEqual([created.body.id]);

        const updated = await api<Api.Alias>("PATCH", `/api/v1/aliases/${created.body.id}`, {
            destination: "two@inbox.test",
            enabled: false,
        });
        expect(updated.status).toBe(200);
        expect(updated.body).toMatchObject({
            destination: "two@inbox.test",
            enabled: false,
            description: "Online shop",
        });

        // Domains and destinations in use cannot be deleted.
        expect((await api("DELETE", `/api/v1/domains/${domain.id}`)).status).toBe(409);
        const destinations = await api<Api.Destination[]>("GET", "/api/v1/destinations");
        const two = destinations.body.find((d) => d.email === "two@inbox.test")!;
        expect((await api("DELETE", `/api/v1/destinations/${two.id}`)).status).toBe(409);

        expect((await api("DELETE", `/api/v1/aliases/${created.body.id}`)).status).toBe(204);
        expect((await api("DELETE", `/api/v1/aliases/${created.body.id}`)).status).toBe(404);
        expect((await api("DELETE", `/api/v1/destinations/${two.id}`)).status).toBe(204);
    });

    it("rejects invalid, duplicate and foreign addresses", async () => {
        await setup();
        const create = (address: string, destination = "one@inbox.test") =>
            api<Api.ApiError>("POST", "/api/v1/aliases", { address, destination });

        expect((await create("dup@alias.test")).status).toBe(201);
        expect((await create("dup@alias.test")).body.error.code).toBe("already_exists");
        expect((await create("has+plus@alias.test")).body.error.code).toBe("invalid_address");
        expect((await create(".dot@alias.test")).body.error.code).toBe("invalid_address");
        expect((await create("x@unknown.test")).body.error.code).toBe("unknown_domain");
        expect((await create("ok@alias.test", "who@inbox.test")).body.error.code).toBe(
            "unknown_destination",
        );
    });

    it("returns 404 for unknown aliases", async () => {
        expect((await api("PATCH", "/api/v1/aliases/missing", { enabled: true })).status).toBe(404);
    });
});
