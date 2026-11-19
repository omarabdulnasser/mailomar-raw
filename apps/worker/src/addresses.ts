// Address rules shared by the API (validation) and the email handler (lookup).

/** Lowercase hostname: labels of letters, digits and inner hyphens. */
export const DOMAIN_PATTERN =
    /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Alias local parts: letters, digits, dots, underscores and hyphens, starting
 * and ending with a letter or digit. "+" is reserved for subaddressing.
 */
export const ALIAS_LOCAL_PART_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;

/**
 * Mailboxes accounts can't create on shared domains: certificate authorities
 * and other services prove control of a domain through them, and the Worker
 * sends its own mail as mailflare@ (see mailer.ts).
 */
export const RESERVED_LOCAL_PARTS = new Set([
    "abuse",
    "admin",
    "administrator",
    "hostmaster",
    "mailer-daemon",
    "mailflare",
    "no-reply",
    "noreply",
    "postmaster",
    "root",
    "security",
    "ssladmin",
    "ssladministrator",
    "sslwebmaster",
    "webmaster",
]);

export function normalizeAddress(address: string) {
    return address.trim().toLowerCase();
}

export function splitAddress(address: string): { local: string; domain: string } | null {
    const at = address.lastIndexOf("@");
    if (at <= 0 || at === address.length - 1) return null;
    return { local: address.slice(0, at), domain: address.slice(at + 1) };
}
