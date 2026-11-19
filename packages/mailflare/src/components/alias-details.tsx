// Wide screens: the selected alias beside the list, editable in place, with
// what it has handled (Worker).

import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { TbClipboardCopy, TbTrash, TbX } from "react-icons/tb";
import { useFormatter, useTranslations } from "use-intl";

import type { Alias, AliasStats } from "../backend/types";
import { useOnlineStatus } from "../hooks/use-online-status";
import { AliasEditFields, useAliasEditForm } from "./alias-edit-form";

function Stat({ label, value }: { label: string; value: string | number }) {
    return (
        <VStack gap={0.5} style={{ flex: 1 }}>
            <Text type="large" weight="bold">
                {value}
            </Text>
            <Text type="supporting">{label}</Text>
        </VStack>
    );
}

function Activity({ stats }: { stats: AliasStats }) {
    const t = useTranslations("alias_details");
    const format = useFormatter();
    return (
        <VStack gap={2}>
            <Text weight="medium">{t("activity")}</Text>
            <HStack gap={2}>
                <Stat label={t("forwarded")} value={stats.forwarded} />
                <Stat label={t("blocked")} value={stats.blocked} />
                <Stat label={t("sent")} value={stats.sent} />
            </HStack>
            <Text type="supporting">
                {t("last_mail")}:{" "}
                {stats.lastEmailAt
                    ? format.relativeTime(new Date(stats.lastEmailAt * 1000))
                    : t("never")}
            </Text>
        </VStack>
    );
}

export function AliasDetails({
    alias,
    onClose,
    onDelete,
}: {
    alias: Alias;
    onClose: () => void;
    onDelete: () => void;
}) {
    const t = useTranslations("alias_details");
    const tc = useTranslations("common");
    const tcard = useTranslations("alias_card");
    const te = useTranslations("alias_edit");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const { control, submit, isSaving, destinationOptions } = useAliasEditForm(
        alias,
        true,
        () => {},
    );

    return (
        <VStack gap={3}>
            <HStack gap={1} align="center">
                <Heading level={3} style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>
                    {alias.address}
                </Heading>
                <IconButton
                    variant="ghost"
                    size="sm"
                    label={tcard("copy")}
                    tooltip={tcard("copy")}
                    icon={<TbClipboardCopy />}
                    onClick={async () => {
                        await navigator.clipboard.writeText(alias.address);
                        toast({ body: tcard("copy_success"), uniqueID: "alias-copied" });
                    }}
                />
                <IconButton
                    variant="ghost"
                    size="sm"
                    label={t("close")}
                    tooltip={t("close")}
                    icon={<TbX />}
                    onClick={onClose}
                />
            </HStack>

            {alias.stats && (
                <>
                    <Activity stats={alias.stats} />
                    <Divider />
                </>
            )}

            <form onSubmit={submit}>
                <VStack gap={3}>
                    <AliasEditFields control={control} destinationOptions={destinationOptions} />
                    <HStack gap={2} justify="between">
                        <Button
                            variant="destructive"
                            label={tc("delete")}
                            icon={<TbTrash />}
                            isDisabled={!isOnline}
                            onClick={onDelete}
                        />
                        <Button
                            type="submit"
                            variant="primary"
                            label={te("save")}
                            isLoading={isSaving}
                            isDisabled={!isOnline}
                        />
                    </HStack>
                </VStack>
            </form>
        </VStack>
    );
}
