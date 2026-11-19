import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useToast } from "@astryxdesign/core/Toast";
import { memo } from "react";
import { useTranslations } from "use-intl";

import type { Alias } from "../backend/types";
import { useMailflare } from "../backend/use-mailflare";
import { useOnlineStatus } from "../hooks/use-online-status";

type Props = {
    open: boolean;
    onClose: () => void;
    alias: Alias | null;
};

// Memoized: the alias list re-renders often (selection, scrolling) while this stays closed.
export const AliasDeleteDialog = memo(function AliasDeleteDialog({ open, onClose, alias }: Props) {
    const t = useTranslations("alias_delete");
    const tc = useTranslations("common");
    const toast = useToast();
    const { deleteAlias } = useMailflare();
    const { isOnline } = useOnlineStatus();

    function handleDelete() {
        if (!alias) return;
        if (!isOnline) {
            toast({ body: tc("offline"), type: "error" });
            return;
        }

        deleteAlias.mutate(alias, {
            onSuccess: () => {
                toast({ body: t("success") });
                onClose();
            },
            onError: (error) => {
                toast({ body: t("error", { error: String(error) }), type: "error" });
            },
        });
    }

    return (
        <AlertDialog
            isOpen={open}
            onOpenChange={(isOpen) => !isOpen && onClose()}
            title={t("title")}
            description={`${t("question_1")} ${alias?.address ?? ""}? ${t("question_2")}`}
            actionLabel={tc("delete")}
            cancelLabel={tc("no")}
            onAction={handleDelete}
            isActionLoading={deleteAlias.isPending}
        />
    );
});
