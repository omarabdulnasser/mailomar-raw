import { defineConfig } from "drizzle-kit";

// Migrations are generated here and applied by Wrangler (see wrangler.jsonc),
// which understands Drizzle's <timestamp>_<name>/migration.sql layout.
export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema.ts",
    out: "./migrations",
});
