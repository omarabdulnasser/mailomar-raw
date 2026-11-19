// Deploys the Worker and applies the database migrations, in the order that
// works for new and existing installs:
//
// - Existing install: migrations first, so the new code never runs against
//   the old schema. Migrations only add tables, columns and indexes, so the
//   running version keeps working with them until the deploy finishes.
// - First deploy: the D1 database only exists once `wrangler deploy` has
//   provisioned it, so applying migrations fails before; they run after.
//
//   node scripts/deploy.mjs [wrangler options, e.g. -c ../../wrangler.jsonc]

import { spawnSync } from "node:child_process";

const options = process.argv.slice(2);

function wrangler(...args) {
    const result = spawnSync("pnpm", ["exec", "wrangler", ...args, ...options], {
        stdio: "inherit",
        shell: process.platform === "win32",
    });
    return result.status === 0;
}

const migrate = () => wrangler("d1", "migrations", "apply", "DB", "--remote");

const migratedFirst = migrate();
if (!migratedFirst)
    console.log("Migrations failed before the deploy (first deploy?); retrying after it.");
if (!wrangler("deploy")) process.exit(1);
if (!migratedFirst && !migrate()) process.exit(1);
