export function sort<TElem>(
    array: readonly TElem[],
    ...criteria: { order?: "asc" | "desc"; by?: (item: TElem) => number | bigint | Date | string }[]
): TElem[] {
    return [...array].sort((a, b) => {
        for (const { order = "asc", by = (item: TElem) => item } of criteria) {
            const aValue = by(a);
            const bValue = by(b);
            if (aValue !== bValue) {
                const compare = aValue < bValue ? -1 : 1;
                return order === "asc" ? compare : -compare;
            }
        }
        return 0;
    });
}
