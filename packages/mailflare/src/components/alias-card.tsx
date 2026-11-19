import { Badge } from "@astryxdesign/core/Badge";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { memo } from "react";
import { TbClipboardCopy, TbEdit, TbTrash } from "react-icons/tb";
import { useTranslations } from "use-intl";

import type { Alias } from "../backend/types";
import { useDestinations } from "../backend/use-mailflare";

function AliasBadge({ alias }: { alias: Alias }) {
    const destinations = useDestinations();
    const t = useTranslations("alias_badge");

    const destination = destinations.data?.find((d) => alias.destination === d.email);
    if (destinations.data && destinations.data.length > 0 && !destination?.verified) {
        return <Badge variant="error" label={t("invalid")} />;
    }
    if (alias.isExternal) {
        return <Badge variant="info" label={t("external")} />;
    }
    if (!alias.enabled) {
        return <Badge variant="warning" label={t("disabled")} />;
    }
    return null;
}

type AliasCardProps = {
    alias: Alias;
    selectEnabled?: boolean;
    isSelected?: boolean;
    // Stable callbacks taking the alias, so unchanged cards don't re-render.
    onSelect: (alias: Alias, selected: boolean) => void;
    onEdit: (alias: Alias) => void;
    onDelete: (alias: Alias) => void;
    /** Wide screens: clicking the card opens it in the detail pane. */
    onOpen?: (alias: Alias) => void;
    /** The alias shown in the detail pane. */
    isOpen?: boolean;
};

export const AliasCard = memo(function AliasCard({
    alias,
    selectEnabled,
    isSelected,
    onSelect,
    onEdit,
    onDelete,
    onOpen,
    isOpen,
}: AliasCardProps) {
    const t = useTranslations("alias_card");
    const toast = useToast();

    const description = alias.description.trim() || t("description_placeholder");

    async function copyAddress() {
        await navigator.clipboard.writeText(alias.address);
        toast({ body: t("copy_success"), uniqueID: "alias-copied" });
    }

    return (
        <Card
            padding={2}
            variant={isSelected || isOpen ? "orange" : "default"}
            onClick={
                selectEnabled ? () => onSelect(alias, !isSelected) : onOpen && (() => onOpen(alias))
            }
            style={selectEnabled || onOpen ? { cursor: "pointer" } : undefined}
        >
            <HStack gap={2} align="center">
                {selectEnabled && (
                    <CheckboxInput
                        size="sm"
                        label={alias.address}
                        isLabelHidden
                        value={!!isSelected}
                        onChange={(checked) => onSelect(alias, checked)}
                    />
                )}

                <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
                    <Text maxLines={1}>{alias.address}</Text>
                    <Text type="supporting" maxLines={1}>
                        {description}
                    </Text>
                </VStack>

                <VStack gap={1} align="end">
                    <HStack gap={0.5}>
                        <IconButton
                            variant="ghost"
                            size="sm"
                            label={t("copy")}
                            tooltip={t("copy")}
                            icon={<TbClipboardCopy />}
                            onClick={(e) => {
                                e.stopPropagation();
                                void copyAddress();
                            }}
                        />
                        {/* With a detail pane, the card itself opens the alias. */}
                        {!onOpen && (
                            <IconButton
                                variant="ghost"
                                size="sm"
                                label={t("edit")}
                                tooltip={t("edit")}
                                icon={<TbEdit />}
                                isDisabled={selectEnabled}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onEdit(alias);
                                }}
                            />
                        )}
                        <IconButton
                            variant="ghost"
                            size="sm"
                            label={t("delete")}
                            tooltip={t("delete")}
                            icon={<TbTrash />}
                            isDisabled={selectEnabled}
                            onClick={(e) => {
                                e.stopPropagation();
                                onDelete(alias);
                            }}
                        />
                    </HStack>
                    <AliasBadge alias={alias} />
                </VStack>
            </HStack>
        </Card>
    );
});
