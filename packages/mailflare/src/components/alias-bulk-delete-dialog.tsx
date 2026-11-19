import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { useToast } from "@astryxdesign/core/Toast";
import { memo, useState } from "react";
import { useTranslations } from "use-intl";

import type { Alias } from "../backend/types";
import { useMailflare } from "../backend/use-mailflare";
import { useOnlineStatus } from "../hooks/use-online-status";
import { useUIStore } from "../stores/ui-store";
import { errorText, settleAll } from "../utils/settle";

type Props = {
    open: boolean;
    onClose: (clear?: boolean) => void;
    selectedAliases: Alias[];
};

// Memoized: the alias list re-renders often (selection, scrolling) while this stays closed.
export const AliasBulkDeleteDialog = memo(function AliasBulkDeleteDialog({
    open,
    onClose,
    selectedAliases,
}: Props) {
    const t = useTranslations("alias_bulk_delete");
    const td = useTranslations("alias_delete");
    const tc = useTranslations("common");
    const toast = useToast();
    const { deleteAlias } = useMailflare();
    const { isOnline } = useOnlineStatus();
    const setSelectedAliases = useUIStore((s) => s.setSelectedAliases);
    const [isSubmitting, setIsSubmitting] = useState(false);

    async function handleDelete() {
        if (!isOnline) {
            toast({ body: tc("offline"), type: "error" });
            return;
        }

        setIsSubmitting(true);
        const { failed, firstError } = await settleAll(selectedAliases, (alias) =>
            deleteAlias.mutateAsync(alias),
        );
        setIsSubmitting(false);
        if (failed.length === 0) {
            toast({ body: t("success") });
            onClose(true);
            return;
        }
        // The ones that failed stay selected, to try again.
        setSelectedAliases(failed);
        toast({
            body: t("partial", {
                failed: failed.length,
                total: selectedAliases.length,
                error: errorText(firstError),
            }),
            type: "error",
        });
        onClose();
    }

    return (
        <AlertDialog
            isOpen={open}
            onOpenChange={(isOpen) => !isOpen && onClose()}
            title={t("title")}
            description={`${t("question", { count: selectedAliases.length })} ${td("question_2")}`}
            actionLabel={tc("delete")}
            cancelLabel={tc("no")}
            onAction={handleDelete}
            isActionLoading={isSubmitting}
        />
    );
});
