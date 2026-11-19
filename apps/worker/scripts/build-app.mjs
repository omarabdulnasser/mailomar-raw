// Builds the Mailflare web app, locked to this Worker, into ./app (the
// Worker's static assets). The deploy button copies the whole repository, so
// the app is built there too; with apps/worker on its own there is no app to
// build, and the Worker serves the API only.
//
//   node scripts/build-app.mjs          build the app
//   node scripts/build-app.mjs --dev    only make sure ./app exists

import { execSync } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const workerDir = fileURLToPath(new URL("..", import.meta.url));
const appDir = fileURLToPath(new URL("../app", import.meta.url));
const webPackage = fileURLToPath(new URL("../../web/package.json", import.meta.url));

if (process.argv.includes("--dev") || !existsSync(webPackage)) {
    if (!process.argv.includes("--dev")) {
        console.warn("The Mailflare web app isn't here; the Worker will serve the API only.");
    }
    mkdirSync(appDir, { recursive: true });
} else {
    execSync("pnpm --filter @mailflare/web build:worker", { cwd: workerDir, stdio: "inherit" });
}
