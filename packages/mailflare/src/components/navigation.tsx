// The app's pages, and which of them the current connection has.

import type { ReactNode } from "react";
import {
    TbAt,
    TbFileImport,
    TbInbox,
    TbSettings,
    TbUserCircle,
    TbUsers,
    TbWorld,
} from "react-icons/tb";
import { useTranslations } from "use-intl";

import { useCloudflareConfig } from "../api/config-context";
import { useMailflare } from "../backend/use-mailflare";

export type NavItem = {
    path: string;
    label: string;
    icon: ReactNode;
    /** Shown in the sidebar's admin section; on narrow screens, on the account page. */
    isAdmin?: boolean;
    /** Only in the sidebar; on narrow screens, reached from Settings. */
    isWideOnly?: boolean;
};

export const PATHS = {
    aliases: "/",
    inboxes: "/inboxes",
    account: "/account",
    adminDomains: "/admin/domains",
    adminAccounts: "/admin/accounts",
    settings: "/settings",
    import: "/import",
} as const;

/** Pages for the current connection. Management pages only exist in the Worker's own app. */
export function useNavItems(): NavItem[] {
    const t = useTranslations("nav");
    const { lockedWorkerUrl, isExtension } = useCloudflareConfig();
    const { account, canEditDomains } = useMailflare();
    const isWorkerApp = !!lockedWorkerUrl;

    const items: (NavItem | false)[] = [
        { path: PATHS.aliases, label: t("aliases"), icon: <TbAt /> },
        isWorkerApp && { path: PATHS.inboxes, label: t("inboxes"), icon: <TbInbox /> },
        isWorkerApp &&
            !!account.data?.user && {
                path: PATHS.account,
                label: t("account"),
                icon: <TbUserCircle />,
            },
        isWorkerApp &&
            canEditDomains && {
                path: PATHS.adminDomains,
                label: t("domains"),
                icon: <TbWorld />,
                isAdmin: true,
            },
        isWorkerApp &&
            canEditDomains && {
                path: PATHS.adminAccounts,
                label: t("accounts"),
                icon: <TbUsers />,
                isAdmin: true,
            },
        // The extension opens the import in a tab of its own.
        !isExtension && {
            path: PATHS.import,
            label: t("import"),
            icon: <TbFileImport />,
            isWideOnly: true,
        },
        { path: PATHS.settings, label: t("settings"), icon: <TbSettings /> },
    ];
    return items.filter((item): item is NavItem => item !== false);
}
