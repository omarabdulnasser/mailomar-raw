import {
    StorageKeys,
    WorkerBackend,
    createBackend,
    normalizeWorkerUrl,
    generateAliasAddress,
    type Alias,
    type AliasSettings,
} from "@mailflare/core/headless";
import messages from "@mailflare/core/i18n/messages/en.json";
import { defineBackground } from "wxt/utils/define-background";

import type { ContentScriptAlert } from "../utils/alerts";
import { migrateStorage } from "../utils/migrate-storage";

type TabMessage =
    | { command: "copyText"; text: string }
    | { command: "showAlert"; alert: ContentScriptAlert }
    | { command: "dismissAlert"; id: number };

async function sendTabMessage(tabId: number | undefined, message: TabMessage) {
    if (!tabId) return;
    return chrome.tabs.sendMessage(tabId, message);
}

/**
 * Makes sure the content script runs in the tab: tabs opened before the
 * extension was installed or updated don't have it yet. The context menu
 * click grants activeTab for this.
 */
async function ensureContentScript(tabId: number) {
    const ready = await chrome.tabs
        .sendMessage(tabId, { command: "ping" })
        .then(() => true)
        .catch(() => false);
    if (ready) return;
    const files = chrome.runtime.getManifest().content_scripts?.[0]?.js ?? [];
    await chrome.scripting.executeScript({ target: { tabId }, files });
}

/** The background's texts, from the app's messages ({alias} filled in). */
function text(key: keyof typeof messages.background, alias = "") {
    return messages.background[key].replace("{alias}", alias);
}

async function generateAliasInBackground(hostname: string): Promise<Alias> {
    await migrateStorage();
    const storage = await chrome.storage.local.get([
        StorageKeys.ApiToken,
        StorageKeys.WorkerUrl,
        StorageKeys.ZoneId,
        StorageKeys.AliasSettings,
    ]);

    const apiToken = storage[StorageKeys.ApiToken] as string | undefined;
    const workerUrl = storage[StorageKeys.WorkerUrl] as string | undefined;
    const zoneId = storage[StorageKeys.ZoneId] as string | undefined;
    const aliasSettings = storage[StorageKeys.AliasSettings] as AliasSettings | undefined;

    if (!apiToken) throw new Error(text("error_not_logged_in"));
    if (!aliasSettings?.destination) throw new Error(text("error_no_destination"));
    if (aliasSettings.format === "custom" || aliasSettings.prefixFormat === "custom") {
        throw new Error(text("error_custom"));
    }

    const backend = createBackend(
        workerUrl
            ? { kind: "worker", url: workerUrl, token: apiToken }
            : { kind: "cloudflare", token: apiToken },
    );
    // The default domain saved in the create dialog; else the selected zone's
    // (none when all domains are listed), else the first.
    const domains = await backend.listDomains();
    const domain =
        domains.find((d) => d.domain === aliasSettings.domain) ??
        domains.find((d) => d.zoneId === zoneId) ??
        domains[0];
    if (!domain) throw new Error(text("error_invalid_domain"));

    const alias = await backend.createAlias({
        zoneId: domain.zoneId,
        address: `${generateAliasAddress({ ...aliasSettings, hostname })}@${domain.domain}`,
        destination: aliasSettings.destination,
        description: hostname,
    });
    // The popup's cached list doesn't have it yet: load it fresh next time.
    const cache: string[] = [StorageKeys.QueryCache];
    await chrome.storage.local.remove(cache);
    return alias;
}

/**
 * Signs in to a Mailflare Worker with an account: the Worker's app asks the
 * user to allow the extension and hands it a session of its own. Stores the
 * connection like the popup's login does, since the sign-in window usually
 * closes the popup.
 */
async function connectWorkerAccount(workerUrl: string): Promise<string> {
    const url = normalizeWorkerUrl(workerUrl);
    const authorize = new URL("/authorize", url);
    authorize.searchParams.set("redirect_uri", chrome.identity.getRedirectURL());
    const result = await chrome.identity.launchWebAuthFlow({
        url: authorize.toString(),
        interactive: true,
    });
    const params = new URLSearchParams(result ? new URL(result).hash.slice(1) : "");
    const token = params.get("token");
    if (!token) {
        throw new Error(
            !result || params.get("error") === "access_denied"
                ? "Sign-in was cancelled"
                : "The Worker didn't return a session",
        );
    }
    const error = await WorkerBackend.verify(url, token);
    if (error) throw new Error(error);

    await chrome.storage.local.set({ [StorageKeys.ApiToken]: token, [StorageKeys.WorkerUrl]: url });
    const stale: string[] = [StorageKeys.ZoneId, StorageKeys.QueryCache];
    await chrome.storage.local.remove(stale);
    return token;
}

export default defineBackground(() => {
    // First start after updating from 1.x (and a no-op afterwards).
    void migrateStorage();

    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId !== "mailflare-generate" || !info.pageUrl) return;

        const tabId = tab?.id;
        if (tabId === undefined) return;
        const loadingAlertId = Date.now();
        // Messages to the page are best effort: the alias is created either way.
        const notify = (message: TabMessage) => sendTabMessage(tabId, message).catch(() => false);
        await ensureContentScript(tabId).catch(() => {});
        await notify({
            command: "showAlert",
            alert: { id: loadingAlertId, message: text("alert_loading"), isLoading: true },
        });

        try {
            const alias = await generateAliasInBackground(new URL(info.pageUrl).hostname);
            await notify({ command: "dismissAlert", id: loadingAlertId });
            const copied = (await notify({ command: "copyText", text: alias.address })) === true;
            await notify({
                command: "showAlert",
                alert: {
                    id: Date.now(),
                    type: "success",
                    message: text(copied ? "alert_created_copied" : "alert_created", alias.address),
                    timeout: 5000,
                },
            });
        } catch (error) {
            await notify({ command: "dismissAlert", id: loadingAlertId });
            await notify({
                command: "showAlert",
                alert: {
                    id: Date.now(),
                    type: "error",
                    message: error instanceof Error ? error.message : String(error),
                },
            });
        }
    });

    // Quick-create button in email inputs (content script).
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.command !== "generateAlias") return;
        // Use the sender's URL, not anything from the message, for the hostname.
        const hostname = sender.url ? new URL(sender.url).hostname : undefined;
        if (!sender.tab || !hostname) {
            sendResponse({ success: false, message: "Unknown page" });
            return;
        }
        generateAliasInBackground(hostname)
            .then((alias) => sendResponse({ success: true, alias: alias.address }))
            .catch((error: unknown) =>
                sendResponse({
                    success: false,
                    message: error instanceof Error ? error.message : String(error),
                }),
            );
        return true; // Keep the channel open for the async response.
    });

    // Account sign-in, requested by the popup (an extension page, never a tab).
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message?.command !== "connectWorkerAccount") return;
        if (sender.id !== chrome.runtime.id || sender.tab || typeof message.url !== "string") {
            sendResponse({ success: false, message: "Not allowed" });
            return;
        }
        connectWorkerAccount(message.url)
            .then((token) => sendResponse({ success: true, token }))
            .catch((error: unknown) =>
                sendResponse({
                    success: false,
                    message: error instanceof Error ? error.message : String(error),
                }),
            );
        return true; // Keep the channel open for the async response.
    });

    chrome.runtime.onInstalled.addListener(() => {
        chrome.contextMenus.create({
            title: text("context_menu"),
            contexts: ["page", "editable"],
            // Where the content script runs, which shows the result and copies the alias.
            documentUrlPatterns: ["https://*/*"],
            id: "mailflare-generate",
        });
    });
});
