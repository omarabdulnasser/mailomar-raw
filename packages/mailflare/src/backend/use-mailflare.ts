import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useCloudflareConfig } from "../api/config-context";
import { getConnection, useAuthStore } from "../stores/auth-store";
import { createBackend } from "./create-backend";
import type {
    AccountUserChanges,
    Alias,
    AliasBackend,
    AliasChanges,
    Connection,
    NewAlias,
} from "./types";

// One instance per connection, shared by every component (and kept across
// re-renders) so per-instance caches like the account ID are reused.
let cached: { key: string; backend: AliasBackend } | null = null;

function getBackend(connection: Connection, cloudflareApiBaseUrl?: string): AliasBackend {
    const key = JSON.stringify([connection, cloudflareApiBaseUrl ?? null]);
    if (cached?.key !== key) {
        cached = { key, backend: createBackend(connection, cloudflareApiBaseUrl) };
    }
    return cached.backend;
}

/** The active backend, or null while logged out. */
export function useBackend(): AliasBackend | null {
    const apiToken = useAuthStore((s) => s.apiToken);
    const workerUrl = useAuthStore((s) => s.workerUrl);
    const { apiBaseUrl } = useCloudflareConfig();
    const connection = getConnection({ apiToken, workerUrl });
    return connection ? getBackend(connection, apiBaseUrl) : null;
}

/** FNV-1a: a short, non-secret fingerprint of a token. */
function fingerprint(text: string) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

/**
 * Which connection cached data belongs to. Part of every query key, so data
 * of one token or Worker never shows up for another, also across tabs
 * sharing the persisted cache.
 */
export function connectionScope(state: { apiToken: string | null; workerUrl: string | null }) {
    if (!state.apiToken) return "none";
    return `${state.workerUrl ?? "cloudflare"}#${fingerprint(state.apiToken)}`;
}

/** The domain filter's value for "all domains": aliases of every zone, in one list. */
export const ALL_ZONES = "*";

/** The first element of every key of the app's own queries (see queryKeys). */
export const QUERY_ROOT = "mailflare";

export const queryKeys = {
    /** All queries of the current connection. */
    get all() {
        return [QUERY_ROOT, connectionScope(useAuthStore.getState())] as const;
    },
    zones: () => [...queryKeys.all, "zones"] as const,
    domains: () => [...queryKeys.all, "domains"] as const,
    zoneStatus: (zoneId: string | null) => [...queryKeys.all, "zone-status", zoneId] as const,
    destinations: () => [...queryKeys.all, "destinations"] as const,
    account: () => [...queryKeys.all, "account"] as const,
    users: () => [...queryKeys.all, "users"] as const,
    aliases: (zoneId?: string | null) =>
        zoneId === undefined
            ? ([...queryKeys.all, "aliases"] as const)
            : ([...queryKeys.all, "aliases", zoneId] as const),
};

const listOptions = {
    retry: false,
    // Offline, a refresh waits for the connection instead of failing, so the
    // cached list stays on screen (and in the persisted cache).
    networkMode: "online",
    staleTime: 5 * 60 * 1000,
    gcTime: Number.POSITIVE_INFINITY,
} as const;

function requireBackend(backend: AliasBackend | null): AliasBackend {
    if (!backend) throw new Error("Not logged in");
    return backend;
}

function requireZone(zoneId: string | null): string {
    if (!zoneId || zoneId === ALL_ZONES) throw new Error("No zone selected");
    return zoneId;
}

/**
 * Only the destinations, for components rendered once per alias: useMailflare
 * sets up every query and mutation of the app.
 */
export function useDestinations() {
    const backend = useBackend();
    return useQuery({
        ...listOptions,
        queryKey: queryKeys.destinations(),
        queryFn: () => requireBackend(backend).listDestinations(),
        enabled: !!backend,
        placeholderData: [],
    });
}

/** Aliases, zones and destinations of the active backend, plus alias mutations. */
export function useMailflare() {
    const backend = useBackend();
    const queryClient = useQueryClient();
    const selectedZoneId = useAuthStore((s) => s.selectedZoneId);
    const setSelectedZoneId = useAuthStore((s) => s.setZone);
    const enabled = !!backend;
    const management = () => {
        const manager = requireBackend(backend).management;
        if (!manager) throw new Error("This backend manages domains elsewhere");
        return manager;
    };

    const zones = useQuery({
        ...listOptions,
        queryKey: queryKeys.zones(),
        queryFn: () => requireBackend(backend).listZones(),
        enabled,
        placeholderData: [],
    });

    const domains = useQuery({
        ...listOptions,
        queryKey: queryKeys.domains(),
        queryFn: () => requireBackend(backend).listDomains(),
        enabled,
        placeholderData: [],
    });

    const zoneStatus = useQuery({
        ...listOptions,
        queryKey: queryKeys.zoneStatus(selectedZoneId),
        queryFn: () => requireBackend(backend).getZoneStatus(requireZone(selectedZoneId)),
        enabled: enabled && !!selectedZoneId && selectedZoneId !== ALL_ZONES,
    });

    const destinations = useQuery({
        ...listOptions,
        queryKey: queryKeys.destinations(),
        queryFn: () => requireBackend(backend).listDestinations(),
        enabled,
        placeholderData: [],
    });

    // Who is signed in to a Worker (admin token or account), and their limits.
    const account = useQuery({
        ...listOptions,
        queryKey: queryKeys.account(),
        queryFn: () => management().getAccount(),
        enabled: enabled && !!backend?.management,
    });

    const allZones = selectedZoneId === ALL_ZONES;
    const aliases = useQuery({
        ...listOptions,
        queryKey: queryKeys.aliases(selectedZoneId),
        queryFn: async () => {
            const current = requireBackend(backend);
            if (!allZones) return current.listAliases(requireZone(selectedZoneId));
            const lists = await Promise.all(
                (zones.data ?? []).map((zone) => current.listAliases(zone.id)),
            );
            return lists.flat();
        },
        // "All domains" needs the zones first.
        enabled: enabled && !!selectedZoneId && (!allZones || !!zones.data?.length),
        placeholderData: [],
    });

    const invalidateAliases = () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.aliases() });

    const createAlias = useMutation({
        mutationKey: ["create-alias"],
        mutationFn: (alias: NewAlias) => requireBackend(backend).createAlias(alias),
        onSuccess: invalidateAliases,
    });

    const updateAlias = useMutation({
        mutationKey: ["update-alias"],
        mutationFn: ({ alias, changes }: { alias: Alias; changes: AliasChanges }) =>
            requireBackend(backend).updateAlias(alias, changes),
        onSuccess: invalidateAliases,
    });

    const deleteAlias = useMutation({
        mutationKey: ["delete-alias"],
        mutationFn: (alias: Alias) => requireBackend(backend).deleteAlias(alias),
        onSuccess: invalidateAliases,
    });

    // Domain and destination management (Worker backend only).
    const invalidateSetup = () =>
        Promise.all([
            queryClient.invalidateQueries({ queryKey: queryKeys.zones() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.domains() }),
            queryClient.invalidateQueries({ queryKey: queryKeys.destinations() }),
        ]);

    const addDomain = useMutation({
        mutationFn: (name: string) => management().addDomain(name),
        onSuccess: invalidateSetup,
    });
    const removeDomain = useMutation({
        mutationFn: (zoneId: string) => management().removeDomain(zoneId),
        onSuccess: async (_, zoneId) => {
            if (selectedZoneId === zoneId) setSelectedZoneId(null);
            await invalidateSetup();
        },
    });
    const addDestination = useMutation({
        mutationFn: (email: string) => management().addDestination(email),
        onSuccess: invalidateSetup,
    });
    const removeDestination = useMutation({
        mutationFn: (id: string) => management().removeDestination(id),
        onSuccess: invalidateSetup,
    });
    const resendConfirmation = useMutation({
        mutationFn: (id: string) => management().resendConfirmation(id),
    });
    const setDomainShared = useMutation({
        mutationFn: ({ zoneId, shared }: { zoneId: string; shared: boolean }) =>
            management().setDomainShared(zoneId, shared),
        onSuccess: invalidateSetup,
    });

    const isWorker = !!backend?.management;
    // The admin token, or an account with the admin role.
    const isAdmin = isWorker && account.data?.role === "admin";

    return {
        backend,
        /** Worker: domains and destinations are managed in the app. */
        canManageDomains: isWorker,
        /** Worker: may add, remove and share domains (admins only). */
        canEditDomains: isAdmin,
        account,
        addDomain,
        removeDomain,
        addDestination,
        removeDestination,
        resendConfirmation,
        setDomainShared,
        selectedZoneId,
        setSelectedZoneId,
        zones,
        domains,
        zoneStatus,
        destinations,
        aliases,
        createAlias,
        updateAlias,
        deleteAlias,
    };
}

/** Accounts on the Worker, for admins. */
export function useAccountUsers(enabled: boolean) {
    const backend = useBackend();
    const queryClient = useQueryClient();
    const management = backend?.management;

    const users = useQuery({
        queryKey: queryKeys.users(),
        queryFn: () => {
            if (!management) throw new Error("This backend has no accounts");
            return management.listUsers();
        },
        enabled: enabled && !!management,
        networkMode: "online",
    });

    const updateUser = useMutation({
        mutationFn: ({ id, changes }: { id: string; changes: AccountUserChanges }) => {
            if (!management) throw new Error("This backend has no accounts");
            return management.updateUser(id, changes);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.users() }),
    });

    return { users, updateUser };
}
