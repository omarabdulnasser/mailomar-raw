// The HTTP API contract, shared with the app's Worker backend (type-only import).
// Timestamps are Unix seconds.

export const API_VERSION = 1;

export type ApiInfo = {
    name: "mailflare";
    apiVersion: number;
    /** Whether accounts are set up, and whether anyone may create one. */
    accounts: { enabled: boolean; publicSignups: boolean };
};

export type ApiError = {
    error: { code: string; message: string };
};

export type Role = "admin" | "user";

export type Limits = {
    aliases: number;
    destinations: number;
    sendsPerDay: number;
};

export type Me = {
    role: Role;
    /** The signed-in account; null when using the ADMIN_TOKEN. */
    user: { id: string; email: string; name: string } | null;
    /** Limits that apply to this caller; null for admins. */
    limits: Limits | null;
};

export type Domain = {
    id: string;
    name: string;
    /** Whether every account may create aliases on it. */
    shared: boolean;
    createdAt: number;
};

export type Destination = {
    id: string;
    email: string;
    /** Aliases only deliver to verified destinations. */
    verified: boolean;
    createdAt: number;
};

export type Alias = {
    id: string;
    address: string;
    domainId: string;
    /** Destination email address. */
    destination: string;
    description: string;
    enabled: boolean;
    createdAt: number;
    forwardedCount: number;
    blockedCount: number;
    /** Messages sent from the alias through reverse addresses. */
    sentCount: number;
    lastEmailAt: number | null;
};

export type User = {
    id: string;
    email: string;
    name: string;
    role: Role;
    emailVerified: boolean;
    banned: boolean;
    createdAt: number;
};

export type CreateDomain = { name: string; shared?: boolean };
export type UpdateDomain = { shared?: boolean };
export type CreateDestination = { email: string };
export type CreateAlias = {
    address: string;
    destination: string;
    description?: string;
    enabled?: boolean;
};
export type UpdateAlias = Partial<Pick<Alias, "destination" | "description" | "enabled">>;
export type UpdateUser = { role?: Role; banned?: boolean };

/**
 * Body of `POST /api/v1/sessions`: the extension's `identity.getRedirectURL()`,
 * which must belong to an extension the Worker knows.
 */
export type CreateSession = { redirectUri: string };

/** A new session for another app, from `POST /api/v1/sessions`. */
export type NewSession = { token: string };
