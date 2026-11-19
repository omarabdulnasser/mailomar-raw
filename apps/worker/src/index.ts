import { app } from "./api";
import { cleanup } from "./cleanup";
import { handleEmail } from "./email";

export default {
    fetch: app.fetch,
    email: handleEmail,
    scheduled: (_controller, env, ctx) => ctx.waitUntil(cleanup(env)),
} satisfies ExportedHandler<Env>;
