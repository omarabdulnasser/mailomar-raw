// Checks that the repository root's wrangler.jsonc (used by the Deploy to
// Cloudflare button) matches this Worker's, apart from paths and comments.

import { readFileSync } from "node:fs";

/** Parses JSONC: drops comments and trailing commas. */
function readJsonc(url) {
    const text = readFileSync(url, "utf8")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/,(\s*[}\]])/g, "$1");
    return JSON.parse(text);
}

/** Prefixes the paths in the Worker's config to make them root-relative. */
function fromRoot(config) {
    const prefix = (path) => `apps/worker/${path}`;
    return {
        ...config,
        $schema: prefix(config.$schema),
        main: prefix(config.main),
        assets: { ...config.assets, directory: prefix(config.assets.directory) },
        d1_databases: config.d1_databases.map((db) => ({
            ...db,
            migrations_dir: prefix(db.migrations_dir),
            migrations_pattern: prefix(db.migrations_pattern),
        })),
    };
}

const worker = readJsonc(new URL("../wrangler.jsonc", import.meta.url));
const root = readJsonc(new URL("../../../wrangler.jsonc", import.meta.url));
const expected = JSON.stringify(fromRoot(worker), null, 4);
// The deploy button adds the IDs of the resources it creates; ignore those.
for (const db of root.d1_databases ?? []) delete db.database_id;
const actual = JSON.stringify(root, null, 4);

if (actual !== expected) {
    console.error("The root wrangler.jsonc doesn't match apps/worker/wrangler.jsonc. Expected:");
    console.error(expected);
    process.exit(1);
}
