import { create } from "zustand";

import type { StorageAdapter } from "../storage/storage";
import { StorageKeys } from "../storage/storage";

export type Settings = {
    ruleFilter: boolean;
    copyAlias: boolean;
    showCreateButton: boolean;
    theme: "dark" | "light" | "system";
};

const defaultSettings: Settings = {
    ruleFilter: true,
    copyAlias: true,
    showCreateButton: false,
    theme: "system",
};

export type SettingsState = Settings & {
    updateSettings: (partial: Partial<Settings>) => void;
};

let _settingsStorage: StorageAdapter | null = null;

export function initSettingsStore(adapter: StorageAdapter) {
    _settingsStorage = adapter;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
    ...defaultSettings,
    updateSettings: (partial) => {
        set(partial);
        if (_settingsStorage) {
            const { updateSettings: _, ...currentSettings } = get();
            _settingsStorage.set(StorageKeys.Settings, currentSettings);
        }
    },
}));

export async function hydrateSettingsStore(adapter: StorageAdapter) {
    const saved = await adapter.get<Settings>(StorageKeys.Settings);
    if (saved) {
        useSettingsStore.setState(saved);
    }
}
