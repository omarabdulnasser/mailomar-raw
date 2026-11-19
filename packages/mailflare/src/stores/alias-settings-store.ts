import { create } from "zustand";

import type { StorageAdapter } from "../storage/storage";
import { StorageKeys } from "../storage/storage";

export const AliasFormats = ["characters", "words", "domain", "custom"] as const;
export type AliasFormat = (typeof AliasFormats)[number];

export const AliasPrefixFormats = [
    "none",
    "domainWithoutExtension",
    "domainWithExtension",
    "fullDomain",
    "custom",
] as const;
export type AliasPrefixFormat = (typeof AliasPrefixFormats)[number];

export type AliasSettings = {
    domain?: string;
    format?: AliasFormat;
    characterCount?: number;
    wordCount?: number;
    separator?: string;
    prefixFormat?: AliasPrefixFormat;
    destination?: string;
};

export type AliasSettingsState = AliasSettings & {
    updateAliasSettings: (partial: Partial<AliasSettings>) => void;
};

let _aliasSettingsStorage: StorageAdapter | null = null;

export function initAliasSettingsStore(adapter: StorageAdapter) {
    _aliasSettingsStorage = adapter;
}

export const useAliasSettingsStore = create<AliasSettingsState>((set, get) => ({
    updateAliasSettings: (partial) => {
        set(partial);
        if (_aliasSettingsStorage) {
            const { updateAliasSettings: _, ...currentSettings } = get();
            _aliasSettingsStorage.set(StorageKeys.AliasSettings, currentSettings);
        }
    },
}));

/** Forgets the saved defaults (they name the account's domains and inboxes). */
export function resetAliasSettings() {
    const { updateAliasSettings } = useAliasSettingsStore.getState();
    useAliasSettingsStore.setState({ updateAliasSettings }, true);
    _aliasSettingsStorage?.remove(StorageKeys.AliasSettings);
}

export async function hydrateAliasSettingsStore(adapter: StorageAdapter) {
    const saved = await adapter.get<AliasSettings>(StorageKeys.AliasSettings);
    if (saved) {
        useAliasSettingsStore.setState(saved);
    }
}
