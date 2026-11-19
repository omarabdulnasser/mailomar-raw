// Just enough RFC 5322 to rewrite a message's headers while passing its body
// through untouched (as bytes, so 8-bit and binary bodies survive).

export type Header = { name: string; value: string };
export type ParsedMessage = { headers: Header[]; body: Uint8Array };
export type Mailbox = { name: string; address: string };

const CRLF = "\r\n";

/**
 * Finds the blank line ending the header block; accepts CRLF or bare LF.
 * `end` excludes the last header's line break, CR included.
 */
function headerEnd(bytes: Uint8Array): { end: number; bodyStart: number } {
    for (let i = 0; i < bytes.length - 1; i += 1) {
        if (bytes[i] !== 10) continue;
        const end = i > 0 && bytes[i - 1] === 13 ? i - 1 : i;
        if (bytes[i + 1] === 10) return { end, bodyStart: i + 2 };
        if (bytes[i + 1] === 13 && bytes[i + 2] === 10) return { end, bodyStart: i + 3 };
    }
    return { end: bytes.length, bodyStart: bytes.length };
}

export function parseMessage(bytes: Uint8Array): ParsedMessage {
    const { end, bodyStart } = headerEnd(bytes);
    // Headers are ASCII, or UTF-8 under RFC 6532.
    const text = new TextDecoder().decode(bytes.subarray(0, end));
    const headers: Header[] = [];
    for (const line of text.split(/\r?\n/)) {
        // A stray CR is not a line break here, and the Email Service rejects it
        // when the message is re-sent (see serializeMessage).
        const clean = line.replace(/\r/g, " ");
        const last = headers.at(-1);
        if (/^[ \t]/.test(clean) && last) {
            last.value += `${CRLF}${clean}`; // Keep folding as is.
            continue;
        }
        const colon = clean.indexOf(":");
        if (colon <= 0) continue;
        headers.push({
            name: clean.slice(0, colon).trim(),
            value: clean.slice(colon + 1).trimStart(),
        });
    }
    return { headers, body: bytes.subarray(bodyStart) };
}

export function serializeMessage({ headers, body }: ParsedMessage): Uint8Array {
    const head = new TextEncoder().encode(
        headers.map((h) => `${h.name}: ${h.value}`).join(CRLF) + CRLF + CRLF,
    );
    const out = new Uint8Array(head.length + body.length);
    out.set(head);
    out.set(body, head.length);
    return out;
}

export function getHeader(headers: Header[], name: string): string | undefined {
    const lower = name.toLowerCase();
    return headers.find((h) => h.name.toLowerCase() === lower)?.value;
}

export function getHeaders(headers: Header[], name: string): string[] {
    const lower = name.toLowerCase();
    return headers.filter((h) => h.name.toLowerCase() === lower).map((h) => h.value);
}

const unfold = (value: string) => value.replace(/\r?\n[ \t]+/g, " ");

// RFC 2047 encoded words (=?charset?B|Q?text?=) in display names.

const ENCODED_WORD = /=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi;

/** The bytes of one encoded word, or null if its base64 data is malformed. */
function wordBytes(encoding: string, text: string): Uint8Array | null {
    let raw: string;
    if (encoding.toUpperCase() === "B") {
        try {
            raw = atob(text);
        } catch {
            // Broken words are common in mail from some senders: leave them as they are.
            return null;
        }
    } else {
        raw = text
            .replace(/_/g, " ")
            .replace(/=([0-9A-F]{2})/gi, (_, hex: string) =>
                String.fromCharCode(Number.parseInt(hex, 16)),
            );
    }
    return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function decodeBytes(charset: string, parts: Uint8Array[]): string {
    const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.length;
    }
    try {
        return new TextDecoder(charset).decode(bytes);
    } catch {
        // An unknown charset: UTF-8 is the best guess left.
        return new TextDecoder().decode(bytes);
    }
}

/**
 * Decodes the encoded words of a header value. Adjacent words with the same
 * charset are one text: a character may be split across them (RFC 2047), and
 * decoding each word on its own would turn it into replacement characters.
 */
export function decodeWords(value: string): string {
    let out = "";
    let last = 0;
    let group: { charset: string; bytes: Uint8Array[] } | null = null;

    for (const match of value.matchAll(ENCODED_WORD)) {
        const gap = value.slice(last, match.index);
        // Whitespace between two encoded words is not displayed.
        const continues = group !== null && gap.trim() === "";
        if (!continues) {
            if (group) out += decodeBytes(group.charset, group.bytes);
            group = null;
            out += gap;
        }
        last = match.index + match[0].length;
        const charset = (match[1] ?? "").toLowerCase();
        const bytes = wordBytes(match[2] ?? "", match[3] ?? "");
        if (!bytes) {
            if (group) out += decodeBytes(group.charset, group.bytes);
            group = null;
            out += match[0];
            continue;
        }
        if (group !== null && group.charset === charset) {
            group.bytes.push(bytes);
        } else {
            if (group) out += decodeBytes(group.charset, group.bytes);
            group = { charset, bytes: [bytes] };
        }
    }
    if (group) out += decodeBytes(group.charset, group.bytes);
    return out + value.slice(last);
}

/** Quotes a display name, encoding it if it isn't plain ASCII. */
export function encodeDisplayName(name: string): string {
    if (/^[\x20-\x7e]*$/.test(name)) return `"${name.replace(/(["\\])/g, "\\$1")}"`;
    const bytes = new TextEncoder().encode(name);
    return `=?UTF-8?B?${btoa(String.fromCharCode(...bytes))}?=`;
}

export function formatMailbox({ name, address }: Mailbox): string {
    return name ? `${encodeDisplayName(name)} <${address}>` : address;
}

/**
 * Parses an address list such as `"Doe, Jane" <jane@x.com>, bob@y.com`.
 * Groups are flattened; comments are dropped.
 */
export function parseAddressList(value: string): Mailbox[] {
    const input = unfold(value);
    const parts: string[] = [];
    let current = "";
    let quoted = false;
    let angle = 0;
    let comment = 0;
    for (let i = 0; i < input.length; i += 1) {
        const c = input[i]!;
        if (quoted) {
            current += c;
            if (c === "\\") current += input[++i] ?? "";
            else if (c === '"') quoted = false;
        } else if (comment > 0) {
            if (c === "(") comment += 1;
            else if (c === ")") comment -= 1;
        } else if (c === '"') {
            quoted = true;
            current += c;
        } else if (c === "(") {
            comment = 1;
        } else if (c === "<") {
            angle += 1;
            current += c;
        } else if (c === ">") {
            angle = Math.max(0, angle - 1);
            current += c;
        } else if ((c === "," || c === ";") && angle === 0) {
            parts.push(current);
            current = "";
        } else if (c === ":" && angle === 0) {
            current = ""; // Group name ("undisclosed-recipients:").
        } else {
            current += c;
        }
    }
    parts.push(current);

    const mailboxes: Mailbox[] = [];
    for (const part of parts) {
        const text = part.trim();
        if (!text) continue;
        const match = /^(.*)<([^<>]*)>$/.exec(text);
        const address = (match ? match[2]! : text).trim();
        if (!address.includes("@")) continue;
        const rawName = match ? match[1]!.trim() : "";
        const name = decodeWords(rawName.replace(/^"(.*)"$/, "$1").replace(/\\(.)/g, "$1")).trim();
        mailboxes.push({ name, address });
    }
    return mailboxes;
}
