// `pnpm build`: builds every app and package. On Workers Builds (the Deploy
// to Cloudflare button) nothing is built here: the deploy command builds the
// Worker and its app, and the extension and landing page aren't needed.
import { spawnSync } from "node:child_process";

if (process.env.WORKERS_CI === "1") {
    console.log("Workers Builds: skipping; `pnpm run deploy` builds the Worker and its app.");
    process.exit(0);
}

const { status } = spawnSync("pnpm", ["-r", "build"], { stdio: "inherit", shell: true });
process.exit(status ?? 1);
