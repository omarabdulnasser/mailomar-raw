import ky from "ky";

import type { ImportedAlias } from "./types";

type AddyAliasResponse = {
    data: {
        id: string;
        email: string;
        local_part: string;
        domain: string;
        active: boolean;
        description: string | null;
    }[];
    meta: {
        current_page: number;
        last_page: number;
        per_page: number;
        total: number;
    };
};

export class AddyClient {
    private baseUrl: string;
    private apiToken: string;

    constructor(apiToken: string, baseUrl = "https://app.addy.io") {
        this.apiToken = apiToken;
        this.baseUrl = baseUrl;
    }

    async fetchAliases(page = 1): Promise<AddyAliasResponse> {
        return ky
            .get(`${this.baseUrl}/api/v1/aliases`, {
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
                searchParams: {
                    "page[number]": page,
                    "page[size]": 100,
                },
            })
            .json<AddyAliasResponse>();
    }

    async getAllAliases(): Promise<ImportedAlias[]> {
        const aliases: ImportedAlias[] = [];
        let page = 1;
        let lastPage = 1;

        do {
            const response = await this.fetchAliases(page);
            lastPage = response.meta.last_page;
            for (const alias of response.data) {
                aliases.push({
                    email: alias.email,
                    localPart: alias.local_part,
                    domain: alias.domain,
                    enabled: alias.active,
                    description: alias.description ?? "",
                    source: "addy",
                });
            }
            page++;
        } while (page <= lastPage);

        return aliases;
    }

    async verifyToken(): Promise<boolean> {
        try {
            await ky.get(`${this.baseUrl}/api/v1/api-token-details`, {
                headers: {
                    Authorization: `Bearer ${this.apiToken}`,
                    "Content-Type": "application/json",
                    "X-Requested-With": "XMLHttpRequest",
                },
            });
            return true;
        } catch {
            return false;
        }
    }
}
