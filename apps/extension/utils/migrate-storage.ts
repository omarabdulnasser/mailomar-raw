// Mailflare 1.x saved everything through @plasmohq/storage, which stores each
// value as a JSON string. 2.x keeps the same keys and shapes but stores values
// as they are, so 1.x data is unwrapped once on the first start after updating.
import { StorageKeys } from "@mailflare/core/storage/keys";

const MIGRATED = "storage-format";
const FORMAT = 2;

const STRINGS = [StorageKeys.ApiToken, StorageKeys.ZoneId, StorageKeys.Version];
const OBJECTS = [StorageKeys.Settings, StorageKeys.AliasSettings];

function parse(value: string): unknown {
    try {
        return JSON.parse(value);
    } catch {
        return undefined;
    }
}

const isObject = (value: unknown) =>
    typeof value === "object" && value !== null && !Array.isArray(value);

let running: Promise<void> | undefined;

/** Converts 1.x data, once; safe to call from every entrypoint. */
export function migrateStorage(): Promise<void> {
    running ??= migrate().catch((error: unknown) => {
        // Worst case the user signs in again; don't block the extension.
        console.error("Mailflare: migrating stored data failed", error);
    });
    return running;
}

async function migrate() {
    const local = chrome.storage.local;
    const { [MIGRATED]: format } = await local.get(MIGRATED);
    if (format === FORMAT) return;

    const stored = await local.get([...STRINGS, ...OBJECTS, StorageKeys.QueryCache]);
    const updates: Record<string, unknown> = { [MIGRATED]: FORMAT };
    const removals: string[] = [];

    for (const key of STRINGS) {
        const value = stored[key];
        // 1.x: '"abc"'. A 2.x value isn't valid JSON (or not a JSON string) and stays.
        if (typeof value !== "string") continue;
        const parsed = parse(value);
        if (typeof parsed === "string") updates[key] = parsed;
        // 1.x stored "nothing selected" as 'null'.
        else if (parsed === null && value.trim() === "null") removals.push(key);
    }
    for (const key of OBJECTS) {
        const value = stored[key];
        if (typeof value !== "string") continue;
        const parsed = parse(value);
        if (isObject(parsed)) updates[key] = parsed;
        else removals.push(key);
    }
    // The 1.x query cache belongs to another client and API; it refills itself.
    if (typeof stored[StorageKeys.QueryCache] === "string") {
        removals.push(StorageKeys.QueryCache);
    }

    if (removals.length > 0) await local.remove(removals);
    await local.set(updates);
}
