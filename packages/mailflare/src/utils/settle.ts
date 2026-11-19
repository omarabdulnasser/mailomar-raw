/**
 * Runs `task` for every item, a few at a time (APIs rate-limit bursts), and
 * reports which items failed instead of stopping at the first error.
 */
export async function settleAll<T>(
    items: T[],
    task: (item: T) => Promise<unknown>,
    concurrency = 5,
): Promise<{ failed: T[]; firstError: unknown }> {
    const failed: T[] = [];
    let firstError: unknown = null;
    for (let i = 0; i < items.length; i += concurrency) {
        const batch = items.slice(i, i + concurrency);
        const results = await Promise.allSettled(batch.map(task));
        for (const [index, result] of results.entries()) {
            if (result.status === "fulfilled") continue;
            failed.push(batch[index]!);
            firstError ??= result.reason;
        }
    }
    return { failed, firstError };
}

/** The readable message of an error. */
export const errorText = (error: unknown) =>
    error instanceof Error ? error.message : String(error);
