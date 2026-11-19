// A list of things to add and remove (domains, inboxes), with optional extra
// controls per item. Without add and remove it is read-only.

import { Button } from "@astryxdesign/core/Button";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import type { UseMutationResult } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useState } from "react";
import { TbTrash } from "react-icons/tb";
import { useTranslations } from "use-intl";

import { useOnlineStatus } from "../hooks/use-online-status";

export type Item = { id: string; label: string; extra?: ReactNode };

export function ManagedList({
    title,
    isTitleHidden,
    description,
    items,
    inputLabel,
    placeholder,
    inputType,
    add,
    remove,
}: {
    title: string;
    /** On a page whose header already says what the list is. */
    isTitleHidden?: boolean;
    description: ReactNode;
    items: Item[];
    inputLabel: string;
    placeholder: string;
    inputType: "text" | "email";
    /** Without add and remove, the list is read-only. */
    add?: UseMutationResult<unknown, Error, string>;
    remove?: UseMutationResult<unknown, Error, string>;
}) {
    const t = useTranslations("manage_domains");
    const tc = useTranslations("common");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const [value, setValue] = useState("");

    const onError = (error: Error) => toast({ body: error.message, type: "error" });

    function submit(event: FormEvent) {
        event.preventDefault();
        if (!value.trim() || !add) return;
        add.mutate(value.trim(), { onSuccess: () => setValue(""), onError });
    }

    return (
        <VStack gap={2}>
            {!isTitleHidden && (
                <VStack gap={0.5}>
                    <Text weight="medium">{title}</Text>
                    <Text type="supporting">{description}</Text>
                </VStack>
            )}

            {items.length === 0 ? (
                <Text type="supporting">{t("empty")}</Text>
            ) : (
                <VStack gap={1}>
                    {items.map((item) => (
                        <HStack key={item.id} gap={2} align="center">
                            <Text maxLines={1} style={{ flex: 1, minWidth: 0 }}>
                                {item.label}
                            </Text>
                            {item.extra}
                            {remove && (
                                <IconButton
                                    variant="ghost"
                                    size="sm"
                                    label={`${tc("delete")} ${item.label}`}
                                    tooltip={tc("delete")}
                                    icon={<TbTrash />}
                                    isDisabled={!isOnline}
                                    isLoading={remove.isPending && remove.variables === item.id}
                                    onClick={() => remove.mutate(item.id, { onError })}
                                />
                            )}
                        </HStack>
                    ))}
                </VStack>
            )}

            {add && (
                <form onSubmit={submit}>
                    <HStack gap={2} align="end">
                        <TextInput
                            type={inputType}
                            label={inputLabel}
                            isLabelHidden
                            placeholder={placeholder}
                            value={value}
                            onChange={setValue}
                            width="100%"
                        />
                        <Button
                            type="submit"
                            style={{ flexShrink: 0 }}
                            label={t("add")}
                            isLoading={add.isPending}
                            isDisabled={!isOnline || !value.trim()}
                        />
                    </HStack>
                </form>
            )}
        </VStack>
    );
}
