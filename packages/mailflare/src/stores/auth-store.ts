import { create } from "zustand";

import type { Connection } from "../backend/types";
import type { StorageAdapter } from "../storage/storage";
import { StorageKeys } from "../storage/storage";

export type AuthState = {
    /** Cloudflare API token, or the Worker's admin token in Worker mode. */
    apiToken: string | null;
    /** Set in Worker mode: the Mailflare Worker's base URL. */
    workerUrl: string | null;
    selectedZoneId: string | null;
    connect: (connection: Connection) => void;
    /** Swaps in a new token for the same connection (the account's session changed). */
    replaceToken: (token: string) => void;
    setZone: (zoneId: string | null) => void;
    logout: () => void;
};

let _authStorage: StorageAdapter | null = null;

export function initAuthStore(adapter: StorageAdapter) {
    _authStorage = adapter;
}

/** The current connection, derived from the stored credentials. */
export function getConnection(state: Pick<AuthState, "apiToken" | "workerUrl">): Connection | null {
    if (!state.apiToken) return null;
    return state.workerUrl
        ? { kind: "worker", url: state.workerUrl, token: state.apiToken }
        : { kind: "cloudflare", token: state.apiToken };
}

export const useAuthStore = create<AuthState>((set) => ({
    apiToken: null,
    workerUrl: null,
    selectedZoneId: null,
    connect: (connection) => {
        const workerUrl = connection.kind === "worker" ? connection.url : null;
        set({ apiToken: connection.token, workerUrl, selectedZoneId: null });
        if (_authStorage) {
            _authStorage.set(StorageKeys.ApiToken, connection.token);
            if (workerUrl) _authStorage.set(StorageKeys.WorkerUrl, workerUrl);
            else _authStorage.remove(StorageKeys.WorkerUrl);
            _authStorage.remove(StorageKeys.ZoneId);
        }
    },
    replaceToken: (token) => {
        set({ apiToken: token });
        _authStorage?.set(StorageKeys.ApiToken, token);
    },
    setZone: (zoneId) => {
        set({ selectedZoneId: zoneId });
        if (_authStorage) {
            if (zoneId) _authStorage.set(StorageKeys.ZoneId, zoneId);
            else _authStorage.remove(StorageKeys.ZoneId);
        }
    },
    logout: () => {
        set({ apiToken: null, workerUrl: null, selectedZoneId: null });
        if (_authStorage) {
            _authStorage.remove(StorageKeys.ApiToken);
            _authStorage.remove(StorageKeys.WorkerUrl);
            _authStorage.remove(StorageKeys.ZoneId);
        }
    },
}));

export async function hydrateAuthStore(adapter: StorageAdapter) {
    const [apiToken, workerUrl, selectedZoneId] = await Promise.all([
        adapter.get<string>(StorageKeys.ApiToken),
        adapter.get<string>(StorageKeys.WorkerUrl),
        adapter.get<string>(StorageKeys.ZoneId),
    ]);
    useAuthStore.setState({ apiToken, workerUrl, selectedZoneId });
}
