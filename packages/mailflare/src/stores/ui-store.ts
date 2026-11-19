import { create } from "zustand";

import type { Alias } from "../backend/types";
import type { StorageAdapter } from "../storage/storage";
import type { AliasFormat, AliasPrefixFormat } from "./alias-settings-store";
import { useAuthStore } from "./auth-store";

const UI_STATE_KEY = "ui-state";
const DEBOUNCE_MS = 300;

export type CreateFormDraft = {
    domain: string;
    format: AliasFormat;
    characterCount: number;
    wordCount: number;
    separator: string;
    customAlias: string;
    description: string;
    prefixFormat: AliasPrefixFormat;
    customPrefix: string;
    destination: string;
};

type PersistedUIState = {
    aliasSearch: string;
    createOpen: boolean;
    searchVisible: boolean;
    selectEnabled: boolean;
    scrollPosition: number;
    createFormDraft: CreateFormDraft | null;
};

export type UIState = {
    hostname: string;
    aliasSearch: string;
    selectedAliases: Alias[];

    // Dialog state
    createOpen: boolean;
    editOpen: boolean;
    deleteOpen: boolean;
    selectEnabled: boolean;
    searchVisible: boolean;
    aliasToEditId: string | null;
    aliasToDeleteId: string | null;

    // Form draft
    createFormDraft: CreateFormDraft | null;

    // Scroll
    scrollPosition: number;

    // Actions
    setHostname: (hostname: string) => void;
    setAliasSearch: (search: string) => void;
    setSelectedAliases: (aliases: Alias[]) => void;
    /** Selects or unselects an alias; repeating it changes nothing. */
    setAliasSelected: (alias: Alias, selected: boolean) => void;
    clearSelection: () => void;
    setCreateOpen: (open: boolean) => void;
    setEditOpen: (open: boolean) => void;
    setDeleteOpen: (open: boolean) => void;
    setSelectEnabled: (enabled: boolean) => void;
    setSearchVisible: (visible: boolean) => void;
    setAliasToEditId: (id: string | null) => void;
    setAliasToDeleteId: (id: string | null) => void;
    setCreateFormDraft: (draft: CreateFormDraft | null) => void;
    setScrollPosition: (pos: number) => void;
};

let _sessionStorage: StorageAdapter | null = null;
let _debounceTimer: ReturnType<typeof setTimeout> | null = null;

function persistState(state: UIState) {
    if (!_sessionStorage) return;
    if (_debounceTimer) clearTimeout(_debounceTimer);
    _debounceTimer = setTimeout(() => {
        const persisted: PersistedUIState = {
            aliasSearch: state.aliasSearch,
            createOpen: state.createOpen,
            searchVisible: state.searchVisible,
            selectEnabled: state.selectEnabled,
            scrollPosition: state.scrollPosition,
            createFormDraft: state.createFormDraft,
        };
        _sessionStorage!.set(UI_STATE_KEY, persisted);
    }, DEBOUNCE_MS);
}

export function initUISessionStorage(adapter: StorageAdapter) {
    _sessionStorage = adapter;
}

export async function hydrateUIStore(adapter: StorageAdapter) {
    const saved = await adapter.get<PersistedUIState>(UI_STATE_KEY);
    if (saved) {
        useUIStore.setState({
            aliasSearch: saved.aliasSearch ?? "",
            createOpen: saved.createOpen ?? false,
            searchVisible: saved.searchVisible ?? false,
            selectEnabled: saved.selectEnabled ?? false,
            scrollPosition: saved.scrollPosition ?? 0,
            createFormDraft: saved.createFormDraft ?? null,
        });
    }
}

export const useUIStore = create<UIState>((set, get) => ({
    hostname: "",
    aliasSearch: "",
    selectedAliases: [],

    createOpen: false,
    editOpen: false,
    deleteOpen: false,
    selectEnabled: false,
    searchVisible: false,
    aliasToEditId: null,
    aliasToDeleteId: null,

    createFormDraft: null,
    scrollPosition: 0,

    setHostname: (hostname) => set({ hostname }),
    setAliasSearch: (aliasSearch) => {
        set({ aliasSearch });
        persistState(get());
    },
    setSelectedAliases: (selectedAliases) => set({ selectedAliases }),
    setAliasSelected: (alias, selected) => {
        const others = get().selectedAliases.filter((a) => a.id !== alias.id);
        set({ selectedAliases: selected ? [...others, alias] : others });
    },
    clearSelection: () => set({ selectedAliases: [] }),
    setCreateOpen: (createOpen) => {
        set({ createOpen });
        persistState(get());
    },
    setEditOpen: (editOpen) => set({ editOpen }),
    setDeleteOpen: (deleteOpen) => set({ deleteOpen }),
    setSelectEnabled: (selectEnabled) => {
        set({ selectEnabled });
        persistState(get());
    },
    setSearchVisible: (searchVisible) => {
        set({ searchVisible });
        persistState(get());
    },
    setAliasToEditId: (aliasToEditId) => set({ aliasToEditId }),
    setAliasToDeleteId: (aliasToDeleteId) => set({ aliasToDeleteId }),
    setCreateFormDraft: (createFormDraft) => {
        set({ createFormDraft });
        persistState(get());
    },
    setScrollPosition: (scrollPosition) => {
        set({ scrollPosition });
        persistState(get());
    },
}));

/**
 * Selections and the create form's draft belong to one domain of one
 * connection: a bulk action must never reach aliases that aren't listed.
 */
useAuthStore.subscribe((state, previous) => {
    // Loading the stored state (from nothing) changes nothing that was shown.
    if (previous.apiToken === null) return;
    const sameConnection =
        state.apiToken === previous.apiToken && state.workerUrl === previous.workerUrl;
    const zoneChanged =
        previous.selectedZoneId !== null && state.selectedZoneId !== previous.selectedZoneId;
    if (sameConnection && !zoneChanged) return;
    const ui = useUIStore.getState();
    if (ui.selectedAliases.length > 0 || ui.selectEnabled) {
        ui.clearSelection();
        ui.setSelectEnabled(false);
    }
    if (ui.createFormDraft) ui.setCreateFormDraft(null);
});
