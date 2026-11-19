// Is a message really from the alias owner? Sending through an alias must be
// limited to its owner, or the Worker becomes an open relay. And which
// senders are authenticated, so accounts may reply to them?

import { splitAddress } from "./addresses";
import { getHeaders, type Header, parseAddressList } from "./mime";

/** The authserv-id Cloudflare Email Routing uses in Authentication-Results. */
export const CLOUDFLARE_AUTHSERV_ID = "mx.cloudflare.net";

/** One result of an Authentication-Results header, e.g. `dmarc=pass header.from=example.com`. */
export type AuthResult = { method: string; result: string; properties: Map<string, string> };

/** Removes RFC 5322 comments ("(...)", possibly nested) outside quoted strings. */
function stripComments(value: string) {
    let out = "";
    let depth = 0;
    let quoted = false;
    for (let i = 0; i < value.length; i += 1) {
        const char = value[i]!;
        if (char === "\\" && (quoted || depth > 0)) {
            if (depth === 0) out += char + (value[i + 1] ?? "");
            i += 1;
        } else if (char === '"' && depth === 0) {
            quoted = !quoted;
            out += char;
        } else if (char === "(" && !quoted) {
            depth += 1;
        } else if (char === ")" && !quoted && depth > 0) {
            depth -= 1;
        } else if (depth === 0) {
            out += char;
        }
    }
    return out;
}

/**
 * Cloudflare's authentication results for the message. Only the topmost
 * Authentication-Results header counts: receiving servers prepend theirs, so
 * anything below it may come from the sender.
 */
export function cloudflareAuthResults(headers: Header[]): AuthResult[] | null {
    const [topmost] = getHeaders(headers, "Authentication-Results");
    if (!topmost) return null;
    const [authservId, ...results] = stripComments(topmost.replace(/\r?\n[ \t]+/g, " ")).split(";");
    if (authservId?.trim().split(/\s+/)[0]?.toLowerCase() !== CLOUDFLARE_AUTHSERV_ID) return null;
    return results.flatMap((text) => {
        const [first, ...rest] = text.trim().split(/\s+/);
        const match = /^([a-z0-9-]+)=([a-z]+)$/i.exec(first ?? "");
        if (!match) return [];
        const properties = new Map<string, string>();
        for (const token of rest) {
            const eq = token.indexOf("=");
            if (eq > 0) {
                properties.set(token.slice(0, eq).toLowerCase(), token.slice(eq + 1).toLowerCase());
            }
        }
        return [{ method: match[1]!.toLowerCase(), result: match[2]!.toLowerCase(), properties }];
    });
}

const domainOf = (address: string) => splitAddress(address.toLowerCase())?.domain ?? "";

/**
 * The domain Cloudflare authenticated the From address for: DMARC passed for
 * it, or SPF passed for an envelope sender on the same domain. Null when
 * neither holds, so the From address may be forged.
 */
export function authenticatedFromDomain(headers: Header[]): string | null {
    const [from] = getHeaders(headers, "From").flatMap(parseAddressList);
    const results = cloudflareAuthResults(headers);
    if (!from || !results) return null;
    const domain = domainOf(from.address);
    const aligned = (other: string | undefined) =>
        !!other && (other === domain || other.endsWith(`.${domain}`));
    const dmarc = results.find((r) => r.method === "dmarc");
    if (dmarc?.result === "pass" && dmarc.properties.get("header.from") === domain) return domain;
    const spf = results.find((r) => r.method === "spf");
    const mailFrom = spf?.properties.get("smtp.mailfrom");
    if (spf?.result === "pass" && aligned(mailFrom && (domainOf(mailFrom) || mailFrom))) {
        return domain;
    }
    return null;
}

export type SenderCheck =
    /** Not the owner's address: treat as ordinary incoming mail. */
    | { owner: false }
    /** Claims to be the owner but isn't authenticated: likely spoofed. */
    | { owner: true; authenticated: false; reason: string }
    | { owner: true; authenticated: true };

/**
 * Whether the owner sent this message to `recipient` (the reverse address it
 * was delivered to).
 */
export function checkSender(
    headers: Header[],
    envelopeFrom: string,
    ownerEmail: string,
    recipient: string,
): SenderCheck {
    const [from] = getHeaders(headers, "From").flatMap(parseAddressList);
    if (!from || from.address.toLowerCase() !== ownerEmail.toLowerCase()) return { owner: false };

    const ownerDomain = domainOf(ownerEmail);
    const results = cloudflareAuthResults(headers);
    const dmarc = results?.find((r) => r.method === "dmarc");
    if (!dmarc) {
        return { owner: true, authenticated: false, reason: "no Cloudflare DMARC result" };
    }
    if (dmarc.result !== "pass") {
        return { owner: true, authenticated: false, reason: `DMARC ${dmarc.result}` };
    }
    if (dmarc.properties.get("header.from") !== ownerDomain) {
        return { owner: true, authenticated: false, reason: "DMARC result for another domain" };
    }
    // The envelope sender must be on the same domain (bounce addresses differ in
    // the local part, e.g. SRS or VERP, but not in the domain).
    const envelopeDomain = domainOf(envelopeFrom);
    if (envelopeDomain !== ownerDomain && !envelopeDomain.endsWith(`.${ownerDomain}`)) {
        return { owner: true, authenticated: false, reason: "envelope sender on another domain" };
    }
    // DKIM signs To and Cc: a signed message of the owner, replayed to another
    // reverse address, doesn't name that address.
    const named = ["To", "Cc"]
        .flatMap((name) => getHeaders(headers, name).flatMap(parseAddressList))
        .some((mailbox) => mailbox.address.toLowerCase() === recipient.toLowerCase());
    if (!named) {
        return { owner: true, authenticated: false, reason: "recipient not in To or Cc" };
    }
    return { owner: true, authenticated: true };
}
