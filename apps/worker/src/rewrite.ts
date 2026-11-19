// Header rewriting for mail passing through an alias. Only allowlisted
// headers survive: the ones mail clients need to display and thread a message.
// Routing traces (Received), signatures (DKIM, ARC), authentication results
// and vendor X- headers are dropped, both for privacy and because Cloudflare's
// Email Service controls or rejects them.

import {
    formatMailbox,
    getHeaders,
    type Header,
    type Mailbox,
    parseAddressList,
    type ParsedMessage,
} from "./mime";

export const ALIAS_HEADER = "X-Mailflare-Alias";

/** Headers kept from the original message, besides the rewritten address headers. */
const PASS_THROUGH = new Set([
    "subject",
    "date",
    "message-id",
    "in-reply-to",
    "references",
    "mime-version",
    "content-type",
    "content-transfer-encoding",
    "content-disposition",
    "content-language",
    "content-id",
    "content-description",
    "thread-index",
    "thread-topic",
    "importance",
    "priority",
]);

/** Kept on incoming mail only: mailing list and auto-reply hints help the recipient's filters. */
const PASS_THROUGH_INBOUND = new Set([
    "list-id",
    "list-unsubscribe",
    "list-unsubscribe-post",
    "list-help",
    "list-subscribe",
    "list-post",
    "list-owner",
    "list-archive",
    "auto-submitted",
    "precedence",
]);

/** List headers whose `<mailto:...>` entries would mail the list from the owner's address. */
const LIST_URI_HEADERS = new Set([
    "list-unsubscribe",
    "list-subscribe",
    "list-post",
    "list-help",
    "list-owner",
    "list-archive",
]);

const MESSAGE_ID = /<[^<>\s]+>/g;

/** The message IDs (with angle brackets) in a Message-ID, In-Reply-To or References value. */
export const messageIdsIn = (value: string) => value.match(MESSAGE_ID) ?? [];

/** Every ID In-Reply-To and References refer to. */
export const referencedIds = (headers: Header[]) =>
    [...getHeaders(headers, "In-Reply-To"), ...getHeaders(headers, "References")].flatMap(
        messageIdsIn,
    );

/** Keeps only the http(s) entries of a list header; null if none are left. */
function withoutMailto(value: string): string | null {
    const entries = value.match(/<[^<>]*>/g);
    if (!entries) return value; // e.g. "List-Post: NO"
    const kept = entries.filter((entry) => !/^<\s*mailto:/i.test(entry));
    return kept.length > 0 ? kept.join(", ") : null;
}

function passThrough(
    headers: Header[],
    options: { extra?: Set<string>; ids?: Map<string, string> } = {},
): Header[] {
    return headers.flatMap((h) => {
        const name = h.name.toLowerCase();
        if (!PASS_THROUGH.has(name) && !options.extra?.has(name)) return [];
        if (LIST_URI_HEADERS.has(name)) {
            const value = withoutMailto(h.value);
            return value === null ? [] : [{ name: h.name, value }];
        }
        if (options.ids && (name === "in-reply-to" || name === "references")) {
            const ids = options.ids;
            return [
                { name: h.name, value: h.value.replace(MESSAGE_ID, (id) => ids.get(id) ?? id) },
            ];
        }
        return [h];
    });
}

async function mapAddressHeader(
    headers: Header[],
    name: string,
    map: (mailbox: Mailbox) => Promise<Mailbox | null>,
): Promise<Header | null> {
    const mailboxes = getHeaders(headers, name).flatMap(parseAddressList);
    const mapped = (await Promise.all(mailboxes.map(map))).filter((m) => m !== null);
    if (mapped.length === 0) return null;
    return { name, value: mapped.map(formatMailbox).join(", ") };
}

/** "Bob (bob at shop.com)": shows who wrote, without a clickable real address. */
export function contactLabel({ name, address }: Mailbox): string {
    const readable = address.replace("@", " at ");
    return name ? `${name} (${readable})` : readable;
}

const LABEL_SUFFIX = /\s*\([^()]*\bat\b[^()]*\)$/;

/** The sender of a message: its From, or the envelope sender without one. */
export function senderOf(headers: Header[], envelopeFrom: string): Mailbox {
    return (
        getHeaders(headers, "From").flatMap(parseAddressList)[0] ?? {
            name: "",
            address: envelopeFrom || "unknown@invalid",
        }
    );
}

/** The addresses in From, Reply-To, To and Cc, lowercase, in that order, each once. */
export function correspondents(headers: Header[], envelopeFrom: string): string[] {
    const addresses = [
        senderOf(headers, envelopeFrom).address,
        ...["Reply-To", "To", "Cc"].flatMap((name) =>
            getHeaders(headers, name)
                .flatMap(parseAddressList)
                .map((m) => m.address),
        ),
    ];
    return [...new Set(addresses.map((a) => a.toLowerCase()))];
}

/**
 * Incoming mail for the owner: senders and other recipients become reverse
 * addresses, so replies (and reply-all) go out through the alias. Recipients
 * without one (null from toReverse) are left out.
 */
export async function rewriteInbound(
    message: ParsedMessage,
    options: {
        alias: string;
        envelopeFrom: string;
        toReverse: (contact: string) => Promise<string | null>;
        /** IDs the contact saw for the owner's messages, mapped to the owner's originals. */
        messageIds?: Map<string, string>;
    },
): Promise<ParsedMessage> {
    const { headers } = message;
    const alias = options.alias.toLowerCase();
    const reverse = async (mailbox: Mailbox): Promise<Mailbox | null> => {
        if (mailbox.address.toLowerCase() === alias) return mailbox;
        const address = await options.toReverse(mailbox.address);
        return address ? { name: contactLabel(mailbox), address } : null;
    };

    const sender = senderOf(headers, options.envelopeFrom);
    const from = (await reverse(sender)) ?? { name: contactLabel(sender), address: options.alias };
    const rewritten: Header[] = [{ name: "From", value: formatMailbox(from) }];
    for (const name of ["Reply-To", "To", "Cc"]) {
        const header = await mapAddressHeader(headers, name, reverse);
        if (header) rewritten.push(header);
    }
    rewritten.push(
        ...passThrough(headers, { extra: PASS_THROUGH_INBOUND, ids: options.messageIds }),
    );
    // The aliases the message already passed through, then this one: how
    // Mailflare Workers notice mail going in circles (see isLooping in email.ts).
    for (const value of getHeaders(headers, ALIAS_HEADER)) {
        rewritten.push({ name: ALIAS_HEADER, value });
    }
    rewritten.push({ name: ALIAS_HEADER, value: options.alias });
    return { headers: rewritten, body: message.body };
}

/**
 * Mail the owner sends through a reverse address: it comes from the alias,
 * and reverse addresses in To/Cc are turned back into the contacts' addresses.
 */
export async function rewriteOutbound(
    message: ParsedMessage,
    options: {
        alias: string;
        /** The contact behind a reverse address of this alias, or null for other addresses. */
        fromReverse: (address: string) => Promise<string | null>;
        /** The Message-ID the contact sees, on the alias's domain. */
        messageId: string;
        /** The owner's earlier Message-IDs, mapped to the ones the contact saw. */
        messageIds?: Map<string, string>;
    },
): Promise<ParsedMessage> {
    const { headers } = message;
    const resolve = async (mailbox: Mailbox): Promise<Mailbox> => {
        const contact = await options.fromReverse(mailbox.address);
        return contact
            ? { name: mailbox.name.replace(LABEL_SUFFIX, ""), address: contact }
            : mailbox;
    };

    const rewritten: Header[] = [{ name: "From", value: options.alias }];
    for (const name of ["To", "Cc"]) {
        const header = await mapAddressHeader(headers, name, resolve);
        if (header) rewritten.push(header);
    }
    // No Reply-To, Sender or X- headers, and a new Message-ID: they could
    // reveal the owner's mailbox or mail domain.
    rewritten.push({ name: "Message-ID", value: options.messageId });
    rewritten.push(
        ...passThrough(headers, { ids: options.messageIds }).filter(
            (h) => h.name.toLowerCase() !== "message-id",
        ),
    );
    return { headers: rewritten, body: message.body };
}
