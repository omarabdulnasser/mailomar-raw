// Aliases stored by a self-hosted Mailflare Worker (apps/worker), managed
// through its HTTP API with the Worker's admin token or an account's session.

import type * as Api from "@mailflare/worker/api";
import ky, { isHTTPError, type KyInstance } from "ky";

import type {
    Account,
    AccountUser,
    Alias,
    AliasBackend,
    AliasChanges,
    AliasDomain,
    Destination,
    DomainManagement,
    NewAlias,
    Zone,
    ZoneStatus,
} from "./types";

/** The Worker API version this client speaks. */
const SUPPORTED_API_VERSION = 1;

/** Turns API error bodies into readable exceptions. */
async function call<T>(request: Promise<T>): Promise<T> {
    try {
        return await request;
    } catch (error) {
        if (isHTTPError(error)) {
            const message = (error.data as Api.ApiError | undefined)?.error?.message;
            if (message) throw new Error(message, { cause: error });
        }
        throw error;
    }
}

/**
 * Normalizes what the user typed into the Worker's base URL: adds https://,
 * drops paths and trailing slashes. Plain http is only allowed for localhost.
 */
export function normalizeWorkerUrl(input: string): string {
    const trimmed = input.trim();
    const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
    // Local dev servers (wrangler dev) speak plain http.
    const scheme = /^(localhost|127\.0\.0\.1)(:|\/|$)/i.test(trimmed) ? "http" : "https";
    const url = new URL(hasScheme ? trimmed : `${scheme}://${trimmed}`);
    const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) {
        throw new Error("The Worker URL must use https");
    }
    return url.origin;
}

const toZone = (domain: Api.Domain): Zone => ({
    id: domain.id,
    name: domain.name,
    shared: domain.shared,
});

const toUser = (user: Api.User): AccountUser => ({
    id: user.id,
    email: user.email,
    role: user.role,
    emailVerified: user.emailVerified,
    banned: user.banned,
});

const toDestination = (destination: Api.Destination): Destination => ({
    id: destination.id,
    email: destination.email,
    verified: destination.verified,
});

const toAlias = (alias: Api.Alias): Alias => ({
    id: alias.id,
    zoneId: alias.domainId,
    address: alias.address,
    destination: alias.destination,
    description: alias.description,
    enabled: alias.enabled,
    isExternal: false,
    order: alias.createdAt,
    stats: {
        forwarded: alias.forwardedCount,
        blocked: alias.blockedCount,
        sent: alias.sentCount,
        lastEmailAt: alias.lastEmailAt,
    },
});

export class WorkerBackend implements AliasBackend {
    readonly kind = "worker";
    readonly management: DomainManagement;
    private readonly http: KyInstance;

    constructor(url: string, token: string) {
        this.http = ky.create({
            baseUrl: `${normalizeWorkerUrl(url)}/api/v1/`,
            headers: { Authorization: `Bearer ${token}` },
            retry: 0,
        });
        this.management = {
            addDomain: async (name) =>
                toZone(
                    await call(this.http.post("domains", { json: { name } }).json<Api.Domain>()),
                ),
            removeDomain: async (zoneId) => {
                await call(this.http.delete(`domains/${encodeURIComponent(zoneId)}`));
            },
            addDestination: async (email) =>
                toDestination(
                    await call(
                        this.http.post("destinations", { json: { email } }).json<Api.Destination>(),
                    ),
                ),
            removeDestination: async (id) => {
                await call(this.http.delete(`destinations/${encodeURIComponent(id)}`));
            },
            resendConfirmation: async (id) => {
                await call(this.http.post(`destinations/${encodeURIComponent(id)}/verify`));
            },
            setDomainShared: async (zoneId, shared) => {
                const body: Api.UpdateDomain = { shared };
                await call(
                    this.http.patch(`domains/${encodeURIComponent(zoneId)}`, { json: body }),
                );
            },
            getAccount: async (): Promise<Account> => {
                const me = await call(this.http.get("me").json<Api.Me>());
                return {
                    role: me.role,
                    user: me.user && { id: me.user.id, email: me.user.email },
                    limits: me.limits,
                };
            },
            listUsers: async () =>
                (await call(this.http.get("users").json<Api.User[]>())).map(toUser),
            updateUser: async (id, changes) => {
                const body: Api.UpdateUser = changes;
                return toUser(
                    await call(
                        this.http
                            .patch(`users/${encodeURIComponent(id)}`, { json: body })
                            .json<Api.User>(),
                    ),
                );
            },
        };
    }

    /** Checks that the URL is a compatible Mailflare Worker and the token works. */
    static async verify(url: string, token: string): Promise<string | null> {
        try {
            const base = normalizeWorkerUrl(url);
            const info = await ky
                .get(`${base}/api/info`, { retry: 0 })
                .json<Partial<Api.ApiInfo>>();
            if (info.name !== "mailflare") return "This URL is not a Mailflare Worker";
            if (info.apiVersion !== SUPPORTED_API_VERSION) {
                return `Unsupported Worker API version ${info.apiVersion}; update the app or the Worker`;
            }
            await call(new WorkerBackend(base, token).http.get("me").json<Api.Me>());
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }

    async listZones(): Promise<Zone[]> {
        const domains = await call(this.http.get("domains").json<Api.Domain[]>());
        return domains.map(toZone);
    }

    async listDomains(): Promise<AliasDomain[]> {
        const domains = await call(this.http.get("domains").json<Api.Domain[]>());
        return domains.map((d) => ({ domain: d.name, zoneId: d.id }));
    }

    /** The Worker can't tell whether a domain's catch-all points at it. */
    async getZoneStatus(): Promise<ZoneStatus | null> {
        return null;
    }

    async listDestinations(): Promise<Destination[]> {
        const destinations = await call(this.http.get("destinations").json<Api.Destination[]>());
        return destinations.map(toDestination);
    }

    async listAliases(zoneId: string): Promise<Alias[]> {
        const aliases = await call(
            this.http.get("aliases", { searchParams: { domainId: zoneId } }).json<Api.Alias[]>(),
        );
        return aliases.map(toAlias);
    }

    async createAlias(alias: NewAlias): Promise<Alias> {
        const body: Api.CreateAlias = {
            address: alias.address,
            destination: alias.destination,
            description: alias.description,
            enabled: alias.enabled ?? true,
        };
        return toAlias(await call(this.http.post("aliases", { json: body }).json<Api.Alias>()));
    }

    async updateAlias(alias: Alias, changes: AliasChanges): Promise<Alias> {
        const body: Api.UpdateAlias = changes;
        return toAlias(
            await call(
                this.http
                    .patch(`aliases/${encodeURIComponent(alias.id)}`, { json: body })
                    .json<Api.Alias>(),
            ),
        );
    }

    async deleteAlias(alias: Alias): Promise<void> {
        await call(this.http.delete(`aliases/${encodeURIComponent(alias.id)}`));
    }
}
