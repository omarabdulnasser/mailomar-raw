import { createContext, useContext } from "react";

import type { StorageAdapter } from "./storage";

const StorageContext = createContext<StorageAdapter | null>(null);

export const StorageProvider = StorageContext.Provider;

export function useStorage(): StorageAdapter {
    const adapter = useContext(StorageContext);
    if (!adapter) {
        throw new Error("useStorage must be used within a StorageProvider");
    }
    return adapter;
}
