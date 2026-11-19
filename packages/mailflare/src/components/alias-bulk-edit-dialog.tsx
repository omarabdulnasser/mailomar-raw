import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { Selector } from "@astryxdesign/core/Selector";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { memo, useEffect, useState } from "react";
import { useTranslations } from "use-intl";

import type { Alias } from "../backend/types";
import { useMailflare } from "../backend/use-mailflare";
import { useOnlineStatus } from "../hooks/use-online-status";
import { useUIStore } from "../stores/ui-store";
import { errorText, settleAll } from "../utils/settle";

type EnabledChange = "keep" | "on" | "off";

type Props = {
    open: boolean;
    onClose: (clear?: boolean) => void;
    selectedAliases: Alias[];
};

// Memoized: the alias list re-renders often (selection, scrolling) while this stays closed.
export const AliasBulkEditDialog = memo(function AliasBulkEditDialog({
    open,
    onClose,
    selectedAliases,
}: Props) {
    const t = useTranslations("alias_bulk_edit");
    const tf = useTranslations("alias_create");
    const tc = useTranslations("common");
    const toast = useToast();
    const { destinations, updateAlias } = useMailflare();
    const { isOnline } = useOnlineStatus();

    const setSelectedAliases = useUIStore((s) => s.setSelectedAliases);
    const [destination, setDestination] = useState("");
    // Keep by default: changing only the destination mustn't re-enable aliases.
    const [enabled, setEnabled] = useState<EnabledChange>("keep");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const changes = {
        ...(destination.trim() !== "" && { destination }),
        ...(enabled !== "keep" && { enabled: enabled === "on" }),
    };
    const hasChanges = Object.keys(changes).length > 0;

    // Every opening starts from "keep everything".
    useEffect(() => {
        if (!open) return;
        setDestination("");
        setEnabled("keep");
    }, [open]);

    // Aliases can only forward to confirmed mailboxes.
    const destinationOptions =
        destinations.data
            ?.filter((d) => d.verified)
            .map((d) => ({ value: d.email, label: d.email })) ?? [];

    async function handleSave() {
        setIsSubmitting(true);
        const { failed, firstError } = await settleAll(selectedAliases, (alias) =>
            updateAlias.mutateAsync({ alias, changes }),
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

    const handleOpenChange = (isOpen: boolean) => !isOpen && onClose();

    return (
        <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form">
            <Layout
                header={<DialogHeader title={t("title")} onOpenChange={handleOpenChange} />}
                footer={
                    <LayoutFooter hasDivider>
                        <Button
                            variant="primary"
                            label={tc("save")}
                            isLoading={isSubmitting}
                            isDisabled={!isOnline || !hasChanges}
                            tooltip={!isOnline ? tc("offline") : undefined}
                            onClick={handleSave}
                        />
                    </LayoutFooter>
                }
            >
                <LayoutContent>
                    <VStack gap={3}>
                        <Selector
                            label={tf("destination")}
                            options={destinationOptions}
                            value={destination || null}
                            onChange={(value: string | null) => setDestination(value ?? "")}
                            placeholder={t("keep_destinations")}
                            hasClear
                        />

                        <Selector
                            label={tc("enabled")}
                            options={[
                                { value: "keep", label: t("enabled_keep") },
                                { value: "on", label: t("enabled_on") },
                                { value: "off", label: t("enabled_off") },
                            ]}
                            value={enabled}
                            onChange={(value) => setEnabled((value as EnabledChange) ?? "keep")}
                        />
                    </VStack>
                </LayoutContent>
            </Layout>
        </Dialog>
    );
});
