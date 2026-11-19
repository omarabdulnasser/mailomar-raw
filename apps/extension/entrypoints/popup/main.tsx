import {
    MailflareProvider,
    MailflareApp,
    ExtensionStorageAdapter,
    SessionStorageAdapter,
    createPersister,
    type CloudflareAccess,
    useUIStore,
} from "@mailflare/core";
import messages from "@mailflare/core/i18n/messages/en.json";
import React from "react";
import ReactDOM from "react-dom/client";

import { migrateStorage } from "../../utils/migrate-storage";

const storageAdapter = new ExtensionStorageAdapter();
const sessionStorageAdapter = new SessionStorageAdapter();
const persister = createPersister(storageAdapter);
// Only English messages exist; format dates and numbers to match them.
const locale = "en";

type ConnectResponse = { success: true; token: string } | { success: false; message: string };

/**
 * Account sign-in runs in the background script: the sign-in window closes
 * this popup, and the background stores the session for its next opening.
 */
async function connectWorkerAccount(url: string): Promise<string> {
    const response = (await chrome.runtime.sendMessage({
        command: "connectWorkerAccount",
        url,
    })) as ConnectResponse;
    if (!response.success) throw new Error(response.message);
    return response.token;
}

// Matches host_permissions in wxt.config.ts.
const cloudflareApi = { origins: ["https://api.cloudflare.com/*"] };
const cloudflareAccess: CloudflareAccess = {
    has: () => chrome.permissions.contains(cloudflareApi),
    request: () => chrome.permissions.request(cloudflareApi),
};

/** The website in the current tab, for website-based aliases (activeTab grants its URL). */
async function currentHostname() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.url) return "";
    const url = new URL(tab.url);
    return url.protocol === "https:" || url.protocol === "http:" ? url.hostname : "";
}

// 1.x data has to be converted before the app reads it.
const [hostname] = await Promise.all([currentHostname().catch(() => ""), migrateStorage()]);
useUIStore.getState().setHostname(hostname);

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <MailflareProvider
            storageAdapter={storageAdapter}
            persister={persister}
            locale={locale}
            messages={messages}
            isExtension={true}
            connectWorkerAccount={connectWorkerAccount}
            cloudflareAccess={cloudflareAccess}
            appVersion={chrome.runtime.getManifest().version}
            sessionStorageAdapter={sessionStorageAdapter}
        >
            <MailflareApp />
        </MailflareProvider>
    </React.StrictMode>,
);
