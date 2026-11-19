import ky from "ky";

import { CLOUDFLARE_API_BASE_URL } from "../const";
import type {
    CloudflareBaseResponse,
    CloudflareCreateEmailRuleResponse,
    CloudflareEmailRule,
    CloudflareEmailRoutingStatusResponse,
    CloudflareListEmailDestinationsResponse,
    CloudflareListEmailRulesResponse,
    CloudflareListZonesResponse,
    CloudflareVerifyTokenResponse,
} from "./cloudflare-types";

export class CloudflareApiClient {
    baseUrl: string;
    apiToken: string;
    itemsPerPage = 50;

    constructor(apiToken: string, baseUrl?: string, itemsPerPage?: number) {
        this.apiToken = apiToken;
        this.baseUrl = baseUrl ?? CLOUDFLARE_API_BASE_URL;
        if (itemsPerPage !== undefined && itemsPerPage > 0 && itemsPerPage <= 50) {
            this.itemsPerPage = itemsPerPage;
        }
    }

    private getHeaders() {
        return {
            Authorization: `Bearer ${this.apiToken}`,
            "Content-Type": "application/json",
        };
    }

    private getPaginationParams(page = 1) {
        return new URLSearchParams({
            page: page.toString(),
            per_page: this.itemsPerPage.toString(),
        });
    }

    async verifyToken(token?: string) {
        return ky
            .get(`${this.baseUrl}/user/tokens/verify`, {
                headers: { Authorization: `Bearer ${token ?? this.apiToken}` },
            })
            .json<CloudflareVerifyTokenResponse>();
    }

    async getZones(page = 1) {
        return ky
            .get(`${this.baseUrl}/zones?${this.getPaginationParams(page)}`, {
                headers: this.getHeaders(),
            })
            .json<CloudflareListZonesResponse>();
    }

    async getDestinations(accountId: string, page = 1) {
        return ky
            .get(
                `${this.baseUrl}/accounts/${accountId}/email/routing/addresses?${this.getPaginationParams(page)}`,
                { headers: this.getHeaders() },
            )
            .json<CloudflareListEmailDestinationsResponse>();
    }

    async getEmailRoutingStatus(zoneId: string) {
        return ky
            .get(`${this.baseUrl}/zones/${zoneId}/email/routing`, {
                headers: this.getHeaders(),
            })
            .json<CloudflareEmailRoutingStatusResponse>();
    }

    async getEmailRules(zoneId: string, page = 1) {
        return ky
            .get(
                `${this.baseUrl}/zones/${zoneId}/email/routing/rules?${this.getPaginationParams(page)}`,
                { headers: this.getHeaders() },
            )
            .json<CloudflareListEmailRulesResponse>();
    }

    async createEmailRule(zoneId: string, rule: Omit<CloudflareEmailRule, "tag">) {
        return ky
            .post(`${this.baseUrl}/zones/${zoneId}/email/routing/rules`, {
                headers: this.getHeaders(),
                json: rule,
            })
            .json<CloudflareCreateEmailRuleResponse>();
    }

    async updateEmailRule(zoneId: string, rule: CloudflareEmailRule) {
        return ky
            .put(`${this.baseUrl}/zones/${zoneId}/email/routing/rules/${rule.tag}`, {
                headers: this.getHeaders(),
                json: rule,
            })
            .json<CloudflareCreateEmailRuleResponse>();
    }

    async deleteEmailRule(zoneId: string, rule: Pick<CloudflareEmailRule, "tag">) {
        return ky
            .delete(`${this.baseUrl}/zones/${zoneId}/email/routing/rules/${rule.tag}`, {
                headers: this.getHeaders(),
            })
            .json<CloudflareBaseResponse<null>>();
    }
}
