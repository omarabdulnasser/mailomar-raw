import type { PersistedClient, Persister } from "@tanstack/react-query-persist-client";

import { type StorageAdapter, StorageKeys } from "./storage";

/** Persists the query cache in a storage adapter (localStorage or chrome.storage). */
export function createPersister(adapter: StorageAdapter): Persister {
    return {
        persistClient: async (client: PersistedClient) => {
            await adapter.set(StorageKeys.QueryCache, client);
        },
        restoreClient: async () => {
            return (await adapter.get<PersistedClient>(StorageKeys.QueryCache)) ?? undefined;
        },
        removeClient: async () => {
            await adapter.remove(StorageKeys.QueryCache);
        },
    };
}
