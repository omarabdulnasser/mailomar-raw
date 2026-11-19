// The backend abstraction: everything the UI and the extension need to manage
// aliases, independent of where they live: Cloudflare Email Routing rules, or
// a self-hosted Mailflare Worker.
//
// All data types are plain, JSON-serializable objects so they survive the
// persisted query cache and session storage unchanged.

export type BackendKind = "cloudflare" | "worker";

/** What the user logged in with; enough to recreate the backend anywhere. */
export type Connection =
    | { kind: "cloudflare"; token: string }
    | { kind: "worker"; url: string; token: string };

/** A group of domains whose aliases are listed together (a Cloudflare zone). */
export type Zone = {
    id: string;
    name: string;
    /** Worker: whether accounts may create aliases on it. */
    shared?: boolean;
};

/** A domain aliases can be created on, and the zone it belongs to. */
export type AliasDomain = {
    domain: string;
    zoneId: string;
};

/** Whether a zone can currently receive mail. */
export type ZoneStatus = {
    ready: boolean;
    /** Where the user can fix the setup, if the backend has such a page. */
    setupUrl?: string;
};

/** A mailbox aliases can forward to. */
export type Destination = {
    id: string;
    email: string;
    verified: boolean;
};

export type Alias = {
    id: string;
    zoneId: string;
    address: string;
    destination: string;
    description: string;
    enabled: boolean;
    /** Created outside Mailflare; shown, but can be hidden by the rule filter. */
    isExternal: boolean;
    /** Sort key, higher is newer. Mailflare uses the creation time in seconds. */
    order: number;
    /** Worker: what the alias has handled. */
    stats?: AliasStats;
};

export type AliasStats = {
    forwarded: number;
    blocked: number;
    sent: number;
    /** Unix seconds; null if it never got mail. */
    lastEmailAt: number | null;
};

export type NewAlias = {
    zoneId: string;
    address: string;
    destination: string;
    description: string;
    enabled?: boolean;
    /** Defaults to the current time in seconds. */
    order?: number;
};

export type AliasChanges = Partial<Pick<Alias, "destination" | "description" | "enabled">>;

/** Who is signed in to a Worker: its admin token, or an account. */
export type Account = {
    role: "admin" | "user";
    /** Null for the admin token. */
    user: { id: string; email: string } | null;
    /** Limits of accounts without the admin role. */
    limits: { aliases: number; destinations: number; sendsPerDay: number } | null;
};

/** An account on a Worker, as admins see it. */
export type AccountUser = {
    id: string;
    email: string;
    role: "admin" | "user";
    emailVerified: boolean;
    banned: boolean;
};

export type AccountUserChanges = Partial<Pick<AccountUser, "role" | "banned">>;

/**
 * Domains and destinations the backend stores itself. Cloudflare keeps them in
 * its dashboard, so only the Worker backend offers this.
 */
export interface DomainManagement {
    addDomain(name: string): Promise<Zone>;
    removeDomain(zoneId: string): Promise<void>;
    addDestination(email: string): Promise<Destination>;
    removeDestination(id: string): Promise<void>;
    /** Mails a new confirmation link to an unconfirmed destination. */
    resendConfirmation(id: string): Promise<void>;
    setDomainShared(zoneId: string, shared: boolean): Promise<void>;
    getAccount(): Promise<Account>;
    listUsers(): Promise<AccountUser[]>;
    updateUser(id: string, changes: AccountUserChanges): Promise<AccountUser>;
}

export interface AliasBackend {
    readonly kind: BackendKind;
    readonly management?: DomainManagement;

    listZones(): Promise<Zone[]>;
    listDomains(): Promise<AliasDomain[]>;
    getZoneStatus(zoneId: string): Promise<ZoneStatus | null>;
    listDestinations(): Promise<Destination[]>;

    listAliases(zoneId: string): Promise<Alias[]>;
    createAlias(alias: NewAlias): Promise<Alias>;
    updateAlias(alias: Alias, changes: AliasChanges): Promise<Alias>;
    deleteAlias(alias: Alias): Promise<void>;
}
