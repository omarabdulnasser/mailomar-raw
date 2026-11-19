import {
    MailflareProvider,
    MailflareApp,
    WebStorageAdapter,
    createPersister,
} from "@mailflare/core";
import messages from "@mailflare/core/i18n/messages/en.json";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";

// A new version takes over as soon as it is installed (and reloads the page),
// instead of the cached one being served once more. Besides the check on
// every page load, look again whenever the app comes back to the foreground,
// so long-open tabs and installed apps pick up updates at a calm moment.
registerSW({
    immediate: true,
    onRegisteredSW(_url, registration) {
        if (!registration) return;
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && navigator.onLine) {
                registration.update().catch(() => {});
            }
        });
    },
});

const storageAdapter = new WebStorageAdapter();
const persister = createPersister(storageAdapter);

// Only English messages exist; format dates and numbers to match them.
const locale = "en";

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <MailflareProvider
            storageAdapter={storageAdapter}
            persister={persister}
            locale={locale}
            messages={messages}
            apiBaseUrl="/api"
            isExtension={false}
            lockedWorkerUrl={import.meta.env.VITE_LOCKED_WORKER ? location.origin : undefined}
        >
            <MailflareApp />
        </MailflareProvider>
    </StrictMode>,
);
