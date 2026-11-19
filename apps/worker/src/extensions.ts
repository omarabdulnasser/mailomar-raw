// Which browser extensions may get a session through the app's /authorize
// page: the published Mailflare extension, plus EXTENSION_IDS (development
// builds, forks).

/** The Mailflare extension in the Chrome Web Store and on Firefox Add-ons. */
export const PUBLISHED_EXTENSION_IDS = [
    "aomfbgcabccoecaoimicmmkjdmdgcfpi",
    "{f0bdc9fa-a062-4424-baee-16530c53aa06}",
];

const CHROMIUM_ID = /^[a-p]{32}$/;

async function sha1Hex(text: string) {
    const digest = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * The host `identity.getRedirectURL()` returns for an extension: its ID on
 * chromiumapp.org in Chromium browsers, the SHA-1 of its ID on
 * extensions.allizom.org in Firefox.
 */
export async function redirectHost(id: string) {
    return CHROMIUM_ID.test(id)
        ? `${id}.chromiumapp.org`
        : `${await sha1Hex(id)}.extensions.allizom.org`;
}

/** Whether `uri` is the `identity.launchWebAuthFlow` redirect of one of these extensions. */
export async function isExtensionRedirect(uri: string, ids: Iterable<string>) {
    let url: URL;
    try {
        url = new URL(uri);
    } catch {
        return false;
    }
    if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash) {
        return false;
    }
    const hosts = await Promise.all([...ids].map(redirectHost));
    return hosts.includes(url.hostname);
}
