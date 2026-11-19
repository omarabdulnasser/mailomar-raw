import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { memo } from "react";
import { useTranslations } from "use-intl";

import type { Alias } from "../backend/types";
import { useOnlineStatus } from "../hooks/use-online-status";
import { AliasEditFields, useAliasEditForm } from "./alias-edit-form";

type Props = {
    open: boolean;
    onClose: () => void;
    alias: Alias | null;
};

// Memoized: the alias list re-renders often (selection, scrolling) while this stays closed.
export const AliasEditDialog = memo(function AliasEditDialog({ open, onClose, alias }: Props) {
    const t = useTranslations("alias_edit");
    const tc = useTranslations("common");
    const { isOnline } = useOnlineStatus();
    const { control, submit, isSaving, destinationOptions } = useAliasEditForm(
        alias,
        open,
        onClose,
    );

    const handleOpenChange = (isOpen: boolean) => !isOpen && onClose();

    return (
        <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
            {/* display: contents lets the Layout fill the dialog (scrolling content,
                pinned footer) while the footer's submit button stays inside the form. */}
            <form onSubmit={submit} style={{ display: "contents" }}>
                <Layout
                    header={<DialogHeader title={t("title")} onOpenChange={handleOpenChange} />}
                    footer={
                        <LayoutFooter hasDivider>
                            <Button
                                type="submit"
                                variant="primary"
                                label={t("save")}
                                isLoading={isSaving}
                                isDisabled={!isOnline}
                                tooltip={!isOnline ? tc("offline") : undefined}
                            />
                        </LayoutFooter>
                    }
                >
                    <LayoutContent>
                        <AliasEditFields
                            control={control}
                            destinationOptions={destinationOptions}
                            address={alias?.address ?? ""}
                        />
                    </LayoutContent>
                </Layout>
            </form>
        </Dialog>
    );
});
