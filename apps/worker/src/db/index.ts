import { defineRelations } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";

import * as schema from "./schema";

export const relations = defineRelations(schema, (r) => ({
    user: {
        sessions: r.many.session(),
        accounts: r.many.account(),
        passkeys: r.many.passkey(),
        aliases: r.many.aliases(),
        destinations: r.many.destinations(),
    },
    session: {
        user: r.one.user({ from: r.session.userId, to: r.user.id, optional: false }),
    },
    account: {
        user: r.one.user({ from: r.account.userId, to: r.user.id, optional: false }),
    },
    passkey: {
        user: r.one.user({ from: r.passkey.userId, to: r.user.id, optional: false }),
    },
    aliases: {
        user: r.one.user({ from: r.aliases.userId, to: r.user.id }),
        domain: r.one.domains({ from: r.aliases.domainId, to: r.domains.id, optional: false }),
        destination: r.one.destinations({
            from: r.aliases.destinationId,
            to: r.destinations.id,
            optional: false,
        }),
    },
    domains: {
        aliases: r.many.aliases(),
    },
    reverseContacts: {
        alias: r.one.aliases({
            from: r.reverseContacts.aliasId,
            to: r.aliases.id,
            optional: false,
        }),
    },
    destinations: {
        user: r.one.user({ from: r.destinations.userId, to: r.user.id }),
        aliases: r.many.aliases(),
    },
}));

export function createDb(d1: D1Database) {
    return drizzle(d1, { relations });
}

export type Db = ReturnType<typeof createDb>;

export { schema };
