// The alias edit form, shared by the edit dialog and the detail pane.

import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { type Control, Controller, useForm } from "react-hook-form";
import { useTranslations } from "use-intl";
import { z } from "zod";

import type { Alias } from "../backend/types";
import { useMailflare } from "../backend/use-mailflare";

const editSchema = z.object({
    description: z.string(),
    destination: z.string().min(1),
    enabled: z.boolean(),
});

export type AliasEditValues = z.infer<typeof editSchema>;

/** Form state for editing `alias`, reset whenever it (or `active`) changes. */
export function useAliasEditForm(alias: Alias | null, active: boolean, onSaved: () => void) {
    const t = useTranslations("alias_edit");
    const toast = useToast();
    const { destinations, updateAlias } = useMailflare();

    const form = useForm<AliasEditValues>({
        resolver: zodResolver(editSchema),
        defaultValues: { description: "", destination: "", enabled: true },
    });
    const { reset } = form;

    useEffect(() => {
        if (alias && active) {
            reset({
                description: alias.description.trim(),
                destination: alias.destination,
                enabled: alias.enabled,
            });
        }
    }, [alias, active, reset]);

    // Aliases can only forward to confirmed mailboxes (keeping the current one).
    const destinationOptions =
        destinations.data
            ?.filter((d) => d.verified || d.email === alias?.destination)
            .map((d) => ({ value: d.email, label: d.email })) ?? [];

    const submit = form.handleSubmit((values) => {
        if (!alias) {
            toast({ body: t("not_found"), type: "error" });
            return;
        }
        updateAlias.mutate(
            { alias, changes: values },
            {
                onSuccess: () => {
                    toast({ body: t("success") });
                    onSaved();
                },
                onError: (error) => {
                    toast({ body: t("error", { error: String(error) }), type: "error" });
                },
            },
        );
    });

    return { control: form.control, submit, isSaving: updateAlias.isPending, destinationOptions };
}

export function AliasEditFields({
    control,
    destinationOptions,
    address,
}: {
    control: Control<AliasEditValues>;
    destinationOptions: { value: string; label: string }[];
    /** Shown read-only at the top; the detail pane has its own heading instead. */
    address?: string;
}) {
    const t = useTranslations("alias_edit");
    const tf = useTranslations("alias_create");
    const tc = useTranslations("common");

    return (
        <VStack gap={3}>
            {address !== undefined && <TextInput label={t("alias")} value={address} isReadOnly />}

            <Controller
                name="description"
                control={control}
                render={({ field }) => (
                    <TextInput
                        label={tf("description")}
                        value={field.value}
                        onChange={(value) => field.onChange(value)}
                    />
                )}
            />

            <Controller
                name="destination"
                control={control}
                render={({ field }) => (
                    <Selector
                        label={tf("destination")}
                        options={destinationOptions}
                        value={field.value}
                        onChange={(value) => field.onChange(value)}
                    />
                )}
            />

            <Controller
                name="enabled"
                control={control}
                render={({ field }) => (
                    <Switch
                        label={tc("enabled")}
                        value={field.value}
                        onChange={(checked) => field.onChange(checked)}
                    />
                )}
            />
        </VStack>
    );
}
