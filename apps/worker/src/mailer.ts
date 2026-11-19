// Account emails (verification links, magic links, password resets), sent
// through the Email Service binding.

import type { Db } from "./db";
import { parseAddressList } from "./mime";
import { getSettings } from "./settings";

export type AccountEmail = { to: string; subject: string; text: string };

/** MAIL_FROM, or "Mailflare <mailflare@first-domain>". */
async function sender(env: Env, db: Db): Promise<EmailAddress> {
    const configured = getSettings(env).mailFrom;
    if (configured) {
        const [mailbox] = parseAddressList(configured);
        if (mailbox) return { name: mailbox.name || "Mailflare", email: mailbox.address };
    }
    const domain = await db.query.domains.findFirst({ orderBy: { createdAt: "asc" } });
    if (!domain) throw new Error("Set MAIL_FROM or add a domain to send account emails");
    return { name: "Mailflare", email: `mailflare@${domain.name}` };
}

export async function sendAccountEmail(env: Env, db: Db, email: AccountEmail) {
    if (!env.EMAIL) throw new Error("The EMAIL binding is required to send account emails");
    await env.EMAIL.send({
        from: await sender(env, db),
        to: email.to,
        subject: email.subject,
        text: email.text,
    });
}
