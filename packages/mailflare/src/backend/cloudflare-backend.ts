// Aliases as Cloudflare Email Routing rules: one literal "to" matcher with one
// "forward" action per alias, managed with the user's API token.

import { isHTTPError } from "ky";

import { CloudflareApiClient } from "../api/cloudflare-client";
import type {
    CloudflareBaseResponse,
    CloudflareEmailRule,
    CloudflareSuccessResponse,
    CloudflareZone,
} from "../api/cloudflare-types";
import { EMAIL_RULE_NAME_PREFIX } from "../const";
import type {
    Alias,
    AliasBackend,
    AliasChanges,
    AliasDomain,
    Destination,
    NewAlias,
    Zone,
    ZoneStatus,
} from "./types";

/** Awaits a Cloudflare request, turning API errors into readable exceptions. */
async function request<T>(
    pending: Promise<CloudflareBaseResponse<T>>,
): Promise<CloudflareSuccessResponse<T>> {
    let response: CloudflareBaseResponse<T>;
    try {
        response = await pending;
    } catch (error) {
        // Non-2xx responses still carry Cloudflare's error list in the body.
        if (isHTTPError(error)) {
            const data = error.data as CloudflareBaseResponse<T> | undefined;
            const message = data?.errors?.[0]?.message;
            if (message) throw new Error(message, { cause: error });
        }
        throw error;
    }
    if (!response.success) {
        throw new Error(response.errors[0]?.message ?? "Unknown Cloudflare API error");
    }
    return response;
}

async function unwrap<T>(pending: Promise<CloudflareBaseResponse<T>>): Promise<T> {
    return (await request(pending)).result;
}

async function getAllPages<T>(
    fetchPage: (page: number) => Promise<CloudflareBaseResponse<T[]>>,
): Promise<T[]> {
    const items: T[] = [];
    for (let page = 1; ; page += 1) {
        const response = await request(fetchPage(page));
        items.push(...response.result);
        const { total_count, per_page } = response.result_info;
        if (page >= Math.ceil(total_count / per_page)) return items;
    }
}

function hasMailflarePrefix(name: string) {
    return name.toLowerCase().startsWith(EMAIL_RULE_NAME_PREFIX);
}

/** Only single-address forwarding rules are aliases; anything else is left alone. */
function isAliasRule(rule: CloudflareEmailRule) {
    return rule.matchers[0]?.type === "literal" && rule.actions[0]?.type === "forward";
}

function ruleToAlias(rule: CloudflareEmailRule, zoneId: string): Alias {
    const isExternal = !hasMailflarePrefix(rule.name);
    return {
        id: rule.tag,
        zoneId,
        address: rule.matchers[0]?.value ?? "",
        destination: rule.actions[0]?.value[0] ?? "",
        description: isExternal ? rule.name : rule.name.slice(EMAIL_RULE_NAME_PREFIX.length),
        enabled: rule.enabled,
        isExternal,
        order: rule.priority,
    };
}

function aliasToRule(alias: Omit<Alias, "id" | "zoneId">): Omit<CloudflareEmailRule, "tag"> {
    return {
        // External rules keep their name as is; ours are tagged with the prefix.
        name: alias.isExternal
            ? alias.description
            : `${EMAIL_RULE_NAME_PREFIX}${alias.description}`,
        enabled: alias.enabled,
        priority: alias.order,
        matchers: [{ type: "literal", field: "to", value: alias.address }],
        actions: [{ type: "forward", value: [alias.destination] }],
    };
}

export class CloudflareBackend implements AliasBackend {
    readonly kind = "cloudflare";
    private readonly client: CloudflareApiClient;
    private firstZone: Promise<CloudflareZone | undefined> | null = null;

    constructor(apiToken: string, apiBaseUrl?: string) {
        this.client = new CloudflareApiClient(apiToken, apiBaseUrl);
    }

    /** Checks a token without creating a backend; returns an error message if invalid. */
    static async verifyToken(apiToken: string, apiBaseUrl?: string): Promise<string | null> {
        try {
            await unwrap(new CloudflareApiClient(apiToken, apiBaseUrl).verifyToken());
            return null;
        } catch (error) {
            return error instanceof Error ? error.message : String(error);
        }
    }

    /** Destinations are account-wide; like before, use the first zone's account. */
    private async accountId() {
        this.firstZone ??= unwrap(this.client.getZones(1)).then((zones) => zones[0]);
        try {
            const zone = await this.firstZone;
            if (!zone) throw new Error("No zones found for this API token");
            return zone.account.id;
        } catch (error) {
            this.firstZone = null; // Retry on the next call.
            throw error;
        }
    }

    async listZones(): Promise<Zone[]> {
        const zones = await getAllPages((page) => this.client.getZones(page));
        return zones.map(({ id, name }) => ({ id, name }));
    }

    async listDomains(): Promise<AliasDomain[]> {
        const zones = await this.listZones();
        const settings = await Promise.all(
            zones.map((zone) =>
                // Zones without Email Routing (or without permission) have no domains.
                unwrap(this.client.getEmailRoutingStatus(zone.id)).catch(() => null),
            ),
        );
        return settings.flatMap((routing) => {
            if (!routing) return [];
            return [routing, ...(routing.subdomains ?? [])].map((d) => ({
                domain: d.name,
                zoneId: routing.id,
            }));
        });
    }

    async getZoneStatus(zoneId: string): Promise<ZoneStatus | null> {
        const routing = await unwrap(this.client.getEmailRoutingStatus(zoneId)).catch(() => null);
        if (!routing) return null;
        const accountId = await this.accountId().catch(() => null);
        return {
            ready: routing.enabled && routing.status === "ready",
            setupUrl: accountId
                ? `https://dash.cloudflare.com/${accountId}/${routing.name}/email/routing/overview`
                : undefined,
        };
    }

    async listDestinations(): Promise<Destination[]> {
        const accountId = await this.accountId();
        const destinations = await getAllPages((page) =>
            this.client.getDestinations(accountId, page),
        );
        return destinations.map((d) => ({
            id: d.tag,
            email: d.email,
            verified: d.verified !== null,
        }));
    }

    async listAliases(zoneId: string): Promise<Alias[]> {
        const rules = await getAllPages((page) => this.client.getEmailRules(zoneId, page));
        return rules.filter(isAliasRule).map((rule) => ruleToAlias(rule, zoneId));
    }

    async createAlias(alias: NewAlias): Promise<Alias> {
        const rule = aliasToRule({
            address: alias.address,
            destination: alias.destination,
            description: alias.description,
            enabled: alias.enabled ?? true,
            isExternal: false,
            order: alias.order ?? Math.round(Date.now() / 1000),
        });
        const created = await unwrap(this.client.createEmailRule(alias.zoneId, rule));
        return ruleToAlias(created, alias.zoneId);
    }

    async updateAlias(alias: Alias, changes: AliasChanges): Promise<Alias> {
        const rule = { ...aliasToRule({ ...alias, ...changes }), tag: alias.id };
        const updated = await unwrap(this.client.updateEmailRule(alias.zoneId, rule));
        return ruleToAlias(updated, alias.zoneId);
    }

    async deleteAlias(alias: Alias): Promise<void> {
        await unwrap(this.client.deleteEmailRule(alias.zoneId, { tag: alias.id }));
    }
}
