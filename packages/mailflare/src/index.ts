// Components
export { MailflareProvider, type MailflareProviderProps } from "./components/providers";
export { MailflareApp } from "./components/mailflare-app";
export { AppLayout } from "./components/app-layout";
export { Login } from "./components/login";
export { AliasList } from "./components/alias-list";
export { AliasCard } from "./components/alias-card";
export { AliasCreateDialog } from "./components/alias-create-dialog";
export { AliasEditDialog } from "./components/alias-edit-dialog";
export { AliasDeleteDialog } from "./components/alias-delete-dialog";
export { AliasBulkEditDialog } from "./components/alias-bulk-edit-dialog";
export { AliasBulkDeleteDialog } from "./components/alias-bulk-delete-dialog";
export { LogoutDialog } from "./components/logout-dialog";
export { OfflineBanner } from "./components/offline-banner";
export { ImportWizard } from "./components/import";

// API
export { CloudflareApiClient } from "./api/cloudflare-client";
export {
    CloudflareConfigProvider,
    useCloudflareConfig,
    type CloudflareAccess,
} from "./api/config-context";
export type {
    CloudflareBaseResponse,
    CloudflareEmailRule,
    CloudflareEmailDestination,
    CloudflareZone,
    CloudflareEmailRoutingStatus,
    CloudflareVerifyToken,
} from "./api/cloudflare-types";

// Backend
export {
    CloudflareBackend,
    WorkerBackend,
    createBackend,
    normalizeWorkerUrl,
    queryKeys,
    useBackend,
    useMailflare,
    verifyConnection,
} from "./backend";
export type {
    Account,
    AccountUser,
    AccountUserChanges,
    Alias,
    AliasBackend,
    AliasChanges,
    AliasDomain,
    AliasStats,
    BackendKind,
    Connection,
    Destination,
    DomainManagement,
    NewAlias,
    Zone,
    ZoneStatus,
} from "./backend";

// Import
export { AddyClient, SimpleLoginClient, useImport } from "./api/import";
export type { ImportService, ImportedAlias, ImportProgress, ImportResult } from "./api/import";

// Stores
export {
    useAuthStore,
    useSettingsStore,
    useAliasSettingsStore,
    useUIStore,
    initUISessionStorage,
    hydrateUIStore,
    AliasFormats,
    AliasPrefixFormats,
} from "./stores";
export type {
    AuthState,
    Settings,
    SettingsState,
    AliasFormat,
    AliasPrefixFormat,
    AliasSettings,
    AliasSettingsState,
    UIState,
    CreateFormDraft,
} from "./stores";

// Storage
export {
    type StorageAdapter,
    StorageKeys,
    StorageProvider,
    useStorage,
    WebStorageAdapter,
    ExtensionStorageAdapter,
    SessionStorageAdapter,
    createPersister,
} from "./storage";

// Utils
export { generateAliasAddress, type GenerateAliasOptions } from "./utils/alias";
export { randomString } from "./utils/random-string";
export { sort } from "./utils/sort";

// Hooks
export { useOnlineStatus } from "./hooks/use-online-status";

// i18n
export { IntlProvider, useTranslations, useLocale, useIntlConfig } from "./i18n";
export type { Messages } from "./i18n";

// Constants
export {
    EMAIL_RULE_NAME_PREFIX,
    CLOUDFLARE_API_BASE_URL,
    GITHUB_LINK,
    CHROME_DOWNLOAD_LINK,
    FIREFOX_DOWNLOAD_LINK,
} from "./const";
