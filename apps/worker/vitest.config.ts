import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
    // The same migrations Wrangler applies, in Drizzle's folder layout.
    const migrations = await readD1Migrations({
        migrationsDir: "migrations",
        migrationsPattern: "migrations/*/migration.sql",
    });

    return {
        plugins: [
            cloudflareTest({
                wrangler: { configPath: "./wrangler.jsonc" },
                remoteBindings: false,
                miniflare: {
                    bindings: {
                        ADMIN_TOKEN: "test-admin-token",
                        AUTH_SECRET: "test-auth-secret-at-least-32-characters",
                        PUBLIC_SIGNUPS: "true",
                        ADMIN_EMAILS: "boss@admin.test",
                        MAIL_FROM: "Mailflare <accounts@mail.test>",
                        MAX_ALIASES_PER_USER: "3",
                        MAX_SENDS_PER_DAY: "2",
                        TEST_MIGRATIONS: migrations,
                    },
                },
            }),
        ],
        test: {
            setupFiles: ["./test/apply-migrations.ts"],
        },
    };
});
