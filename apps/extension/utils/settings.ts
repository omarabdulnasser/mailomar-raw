// Content-script access to the app settings, straight from chrome.storage.
// Imported from the tiny storage module, not the headless entry, which would
// pull the API client and public-suffix list into every page.
import { StorageKeys } from "@mailflare/core/storage/keys";

export type ContentSettings = {
    showCreateButton?: boolean;
    copyAlias?: boolean;
    theme?: "light" | "dark" | "system";
};

/** Calls `onChange` with the current settings, then again whenever they change. */
export function watchSettings(onChange: (settings: ContentSettings) => void) {
    chrome.storage.local.get(StorageKeys.Settings).then((result) => {
        onChange((result[StorageKeys.Settings] as ContentSettings | undefined) ?? {});
    });
    chrome.storage.onChanged.addListener((changes, area) => {
        const change = changes[StorageKeys.Settings];
        if (area === "local" && change) {
            onChange((change.newValue as ContentSettings | undefined) ?? {});
        }
    });
}

/** CSS `color-scheme` for an element following the app's theme setting. */
export function colorScheme(settings: ContentSettings) {
    const theme = settings.theme ?? "system";
    return theme === "system" ? "light dark" : theme;
}
