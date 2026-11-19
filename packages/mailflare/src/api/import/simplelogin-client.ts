import ky from "ky";

import type { ImportedAlias } from "./types";

type SimpleLoginAlias = {
    id: number;
    email: string;
    name: string | null;
    enabled: boolean;
    note: string | null;
};

type SimpleLoginAliasResponse = {
    aliases: SimpleLoginAlias[];
};

export class SimpleLoginClient {
    private baseUrl: string;
    private apiToken: string;

    constructor(apiToken: string, baseUrl = "https://app.simplelogin.io") {
        this.apiToken = apiToken;
        this.baseUrl = baseUrl;
    }

    async fetchAliases(pageId = 0): Promise<SimpleLoginAliasResponse> {
        return ky
            .get(`${this.baseUrl}/api/v2/aliases`, {
                headers: {
                    Authentication: this.apiToken,
                    "Content-Type": "application/json",
                },
                searchParams: {
                    page_id: pageId,
                },
            })
            .json<SimpleLoginAliasResponse>();
    }

    async getAllAliases(): Promise<ImportedAlias[]> {
        const aliases: ImportedAlias[] = [];
        let pageId = 0;

        // SimpleLogin returns 20 per page, empty array when done
        while (true) {
            const response = await this.fetchAliases(pageId);
            if (response.aliases.length === 0) break;

            for (const alias of response.aliases) {
                const [localPart, domain] = alias.email.split("@");
                if (!localPart || !domain) continue;
                aliases.push({
                    email: alias.email,
                    localPart,
                    domain,
                    enabled: alias.enabled,
                    description: alias.note ?? alias.name ?? "",
                    source: "simplelogin",
                });
            }
            pageId++;
        }

        return aliases;
    }

    async verifyToken(): Promise<boolean> {
        try {
            await ky.get(`${this.baseUrl}/api/user_info`, {
                headers: {
                    Authentication: this.apiToken,
                },
            });
            return true;
        } catch {
            return false;
        }
    }
}
