import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useToast } from "@astryxdesign/core/Toast";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { signOutAccount } from "../account/account-client";
import { useCloudflareConfig } from "../api/config-context";
import { useStorage } from "../storage/context";
import { StorageKeys } from "../storage/storage";
import { resetAliasSettings } from "../stores/alias-settings-store";
import { useAuthStore } from "../stores/auth-store";

type Props = {
    open: boolean;
    onClose: () => void;
    /** Called after logging out, for example to close the surrounding drawer. */
    onLoggedOut?: () => void;
};

export function LogoutDialog({ open, onClose, onLoggedOut }: Props) {
    const t = useTranslations("settings.logout");
    const tc = useTranslations("common");
    const toast = useToast();
    const queryClient = useQueryClient();
    const logout = useAuthStore((s) => s.logout);
    const storageAdapter = useStorage();
    const { lockedWorkerUrl } = useCloudflareConfig();

    async function handleLogout() {
        // End an account session on the Worker too, so its token stops working.
        const { apiToken, workerUrl } = useAuthStore.getState();
        if (apiToken && workerUrl) {
            try {
                await signOutAccount(workerUrl, apiToken);
            } catch {
                // The Worker's own app would sign back in with the session's
                // cookie, so it can only log out once the Worker confirms.
                if (lockedWorkerUrl) {
                    toast({ body: t("failed"), type: "error" });
                    onClose();
                    return;
                }
            }
        }
        logout();
        // Everything of the account: cached data, also in memory (where it
        // would be persisted again), and the defaults naming its inboxes.
        queryClient.clear();
        await storageAdapter.remove(StorageKeys.QueryCache);
        resetAliasSettings();
        toast({ body: t("success") });
        onClose();
        onLoggedOut?.();
    }

    return (
        <AlertDialog
            isOpen={open}
            onOpenChange={(isOpen) => !isOpen && onClose()}
            title={t("dialog.title")}
            description={t("dialog.description")}
            actionLabel={tc("yes")}
            cancelLabel={tc("no")}
            onAction={handleLogout}
            width={320}
        />
    );
}
