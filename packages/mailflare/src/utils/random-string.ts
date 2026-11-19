const DEFAULT_CHARSET = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export function randomString(length: number, charSet = DEFAULT_CHARSET): string {
    if (charSet.length <= 0) return "";

    const array = new Uint32Array(length);
    crypto.getRandomValues(array);

    let result = "";
    for (let i = 0; i < length; i++) {
        result += charSet[(array[i] ?? 0) % charSet.length];
    }

    return result;
}
