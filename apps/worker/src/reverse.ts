// Reverse addresses: how contacts reach you, and you them, through an alias.
//
//   alias+bob=shop.com@example.com   readable form, for bob@shop.com
//   alias+=k3x9q2m7p4@example.com    short form with a stored key, used when the
//                                    readable form exceeds 64 characters
//
// The readable form splits at the last "=" (domains never contain one), so
// contact local parts may contain "=" and "+" without escaping. You can also
// write it yourself to start a new conversation from an alias. A long alias
// gets a shorter key (see keyLengthFor) so the short form fits too.

import { splitAddress } from "./addresses";

/** RFC 5321 limit for the part before the "@". */
export const MAX_LOCAL_PART = 64;

export type ReverseTarget = { kind: "address"; contact: string } | { kind: "key"; key: string };

/** Interprets the subaddress tag (after the alias's "+"); null for plain subaddresses. */
export function parseReverseTag(tag: string): ReverseTarget | null {
    if (tag.startsWith("=")) {
        const key = tag.slice(1).toLowerCase();
        return /^[a-z0-9]{6,32}$/.test(key) ? { kind: "key", key } : null;
    }
    const at = tag.lastIndexOf("=");
    if (at <= 0 || at === tag.length - 1) return null;
    const local = tag.slice(0, at);
    const domain = tag.slice(at + 1).toLowerCase();
    // Hostnames, with internationalized TLDs in their xn-- form.
    if (!/^[a-z0-9.-]+\.(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(domain)) return null;
    return { kind: "address", contact: `${local}@${domain}` };
}

/**
 * The readable reverse address, or null if it would be too long or wouldn't
 * read back as the same contact (e.g. a local part starting with "=", or a
 * domain that isn't a plain hostname).
 */
export function readableReverseAddress(alias: string, contact: string): string | null {
    const aliasParts = splitAddress(alias);
    const contactParts = splitAddress(contact);
    if (!aliasParts || !contactParts) return null;
    const tag = `${contactParts.local}=${contactParts.domain.toLowerCase()}`;
    const local = `${aliasParts.local}+${tag}`;
    if (local.length > MAX_LOCAL_PART) return null;
    const back = parseReverseTag(tag);
    if (back?.kind !== "address" || back.contact.toLowerCase() !== contact.toLowerCase()) {
        return null;
    }
    return `${local}@${aliasParts.domain}`;
}

export function keyedReverseAddress(alias: string, key: string): string | null {
    const parts = splitAddress(alias);
    if (!parts) return null;
    const local = `${parts.local}+=${key}`;
    if (local.length > MAX_LOCAL_PART) return null;
    return `${local}@${parts.domain}`;
}

/** The usual key length; a longer alias local part gets a shorter key. */
export const KEY_LENGTH = 10;

/** The shortest key parseReverseTag accepts. */
const MIN_KEY_LENGTH = 6;

/** The key length that keeps `alias+=<key>@domain` within the local-part limit; 0 if none fits. */
export function keyLengthFor(alias: string): number {
    const parts = splitAddress(alias);
    if (!parts) return 0;
    const room = MAX_LOCAL_PART - parts.local.length - 2; // "+="
    return room < MIN_KEY_LENGTH ? 0 : Math.min(room, KEY_LENGTH);
}

const KEY_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

export function randomKey(length = 10): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join("");
}
