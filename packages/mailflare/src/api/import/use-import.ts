import { useCallback, useRef, useState } from "react";

import type { AliasBackend } from "../../backend/types";
import { AddyClient } from "./addy-client";
import { SimpleLoginClient } from "./simplelogin-client";
import type { ImportedAlias, ImportProgress, ImportResult, ImportService } from "./types";

const IMPORT_DELAY_MS = 250;

function delay(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function useImport() {
    const [progress, setProgress] = useState<ImportProgress>({
        total: 0,
        completed: 0,
        failed: 0,
        errors: [],
        status: "idle",
    });

    const abortRef = useRef(false);

    const fetchAliases = useCallback(
        async (
            service: ImportService,
            apiToken: string,
            serviceBaseUrl?: string,
        ): Promise<ImportedAlias[]> => {
            setProgress((p) => ({ ...p, status: "fetching", errors: [] }));
            try {
                const client =
                    service === "addy"
                        ? new AddyClient(apiToken, serviceBaseUrl)
                        : new SimpleLoginClient(apiToken, serviceBaseUrl);
                const aliases = await client.getAllAliases();
                setProgress((p) => ({ ...p, status: "idle", total: aliases.length }));
                return aliases;
            } catch (error) {
                setProgress((p) => ({
                    ...p,
                    status: "error",
                    errors: [`Failed to fetch aliases: ${String(error)}`],
                }));
                // Not "no aliases found": the caller reports the failure.
                throw error;
            }
        },
        [],
    );

    const verifyServiceToken = useCallback(
        async (
            service: ImportService,
            apiToken: string,
            serviceBaseUrl?: string,
        ): Promise<boolean> => {
            const client =
                service === "addy"
                    ? new AddyClient(apiToken, serviceBaseUrl)
                    : new SimpleLoginClient(apiToken, serviceBaseUrl);
            return client.verifyToken();
        },
        [],
    );

    const importAliases = useCallback(
        async (
            aliases: ImportedAlias[],
            backend: AliasBackend,
            domainToZoneId: Record<string, string>,
            destination: string,
        ): Promise<ImportResult> => {
            abortRef.current = false;
            const result: ImportResult = { imported: 0, skipped: 0, failed: 0, errors: [] };

            setProgress({
                total: aliases.length,
                completed: 0,
                failed: 0,
                errors: [],
                status: "importing",
            });

            for (const alias of aliases) {
                if (abortRef.current) break;

                const zoneId = domainToZoneId[alias.domain.toLowerCase()];
                if (!zoneId) {
                    result.skipped++;
                    setProgress((p) => ({
                        ...p,
                        completed: p.completed + 1,
                    }));
                    continue;
                }

                try {
                    await backend.createAlias({
                        zoneId,
                        address: alias.email,
                        destination,
                        description: alias.description || alias.localPart,
                        enabled: alias.enabled,
                        // Rules: after the ones created in Mailflare. The Worker
                        // lists aliases by creation time.
                        order: 0,
                    });
                    result.imported++;
                } catch (error) {
                    result.failed++;
                    const msg = `Failed to import ${alias.email}: ${String(error)}`;
                    result.errors.push(msg);
                    setProgress((p) => ({
                        ...p,
                        failed: p.failed + 1,
                        errors: [...p.errors, msg],
                    }));
                }

                setProgress((p) => ({
                    ...p,
                    completed: p.completed + 1,
                }));

                // Rate limit delay
                await delay(IMPORT_DELAY_MS);
            }

            setProgress((p) => ({ ...p, status: "done" }));
            return result;
        },
        [],
    );

    const abort = useCallback(() => {
        abortRef.current = true;
    }, []);

    const reset = useCallback(() => {
        abortRef.current = false;
        setProgress({
            total: 0,
            completed: 0,
            failed: 0,
            errors: [],
            status: "idle",
        });
    }, []);

    return { progress, fetchAliases, verifyServiceToken, importAliases, abort, reset };
}
