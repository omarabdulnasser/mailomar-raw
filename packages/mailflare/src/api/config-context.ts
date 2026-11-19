import { createContext, useContext } from "react";

type CloudflareConfig = {
    apiBaseUrl?: string;
    isExtension: boolean;
    /**
     * Set when a Mailflare Worker serves the app itself: the app only connects
     * to that Worker, and offers its accounts.
     */
    lockedWorkerUrl?: string;
    /**
     * Signs in to a Worker with an account through the Worker's own app (its
     * `/authorize` page); resolves to a session token. The extension provides it.
     */
    connectWorkerAccount?: (workerUrl: string) => Promise<string>;
    /** The extension's access to the Cloudflare API, which users can withdraw. */
    cloudflareAccess?: CloudflareAccess;
    /** The extension's version, for the notice after an update. */
    appVersion?: string;
};

export type CloudflareAccess = {
    has: () => Promise<boolean>;
    /** Asks the user; call it right in a click handler. */
    request: () => Promise<boolean>;
};

const CloudflareConfigContext = createContext<CloudflareConfig>({
    isExtension: false,
});

export const CloudflareConfigProvider = CloudflareConfigContext.Provider;

export function useCloudflareConfig() {
    return useContext(CloudflareConfigContext);
}
