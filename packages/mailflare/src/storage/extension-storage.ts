import type { StorageAdapter } from "./storage";

declare const chrome: {
    storage: {
        local: {
            get(key: string): Promise<Record<string, unknown>>;
            set(items: Record<string, unknown>): Promise<void>;
            remove(key: string): Promise<void>;
        };
        session: {
            get(key: string): Promise<Record<string, unknown>>;
            set(items: Record<string, unknown>): Promise<void>;
            remove(key: string): Promise<void>;
        };
    };
};

export class ExtensionStorageAdapter implements StorageAdapter {
    async get<T>(key: string): Promise<T | null> {
        const result = await chrome.storage.local.get(key);
        return (result[key] as T) ?? null;
    }

    async set<T>(key: string, value: T): Promise<void> {
        await chrome.storage.local.set({ [key]: value });
    }

    async remove(key: string): Promise<void> {
        await chrome.storage.local.remove(key);
    }
}

export class SessionStorageAdapter implements StorageAdapter {
    async get<T>(key: string): Promise<T | null> {
        const result = await chrome.storage.session.get(key);
        return (result[key] as T) ?? null;
    }

    async set<T>(key: string, value: T): Promise<void> {
        await chrome.storage.session.set({ [key]: value });
    }

    async remove(key: string): Promise<void> {
        await chrome.storage.session.remove(key);
    }
}
