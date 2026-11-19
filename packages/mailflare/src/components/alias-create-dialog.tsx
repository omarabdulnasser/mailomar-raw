import { Button } from "@astryxdesign/core/Button";
import { Dialog, DialogHeader } from "@astryxdesign/core/Dialog";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Layout, LayoutContent, LayoutFooter } from "@astryxdesign/core/Layout";
import { NumberInput } from "@astryxdesign/core/NumberInput";
import { Selector } from "@astryxdesign/core/Selector";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { zodResolver } from "@hookform/resolvers/zod";
import { memo, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { TbRefresh } from "react-icons/tb";
import { useTranslations } from "use-intl";
import { z } from "zod";

import { useCloudflareConfig } from "../api/config-context";
import { useMailflare } from "../backend/use-mailflare";
import { useOnlineStatus } from "../hooks/use-online-status";
import {
    useAliasSettingsStore,
    AliasFormats,
    AliasPrefixFormats,
} from "../stores/alias-settings-store";
import { useSettingsStore } from "../stores/settings-store";
import { useUIStore } from "../stores/ui-store";
import { generateAliasAddress } from "../utils/alias";

type Props = {
    open: boolean;
    onClose: () => void;
};

/** Alias names: letters, digits, dots, underscores and hyphens; a letter or digit at both ends. */
const LOCAL_PART = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/i;
const PREFIX = /^[a-z0-9._-]{1,32}$/i;

// Memoized: the alias list re-renders often (selection, scrolling) while this stays closed.
export const AliasCreateDialog = memo(function AliasCreateDialog({ open, onClose }: Props) {
    const t = useTranslations("alias_create");
    const tc = useTranslations("common");
    const toast = useToast();
    const { isExtension } = useCloudflareConfig();
    const { selectedZoneId, zones, domains, destinations, aliases, createAlias } = useMailflare();
    // Aliases can only forward to confirmed mailboxes.
    const confirmed = useMemo(
        () => destinations.data?.filter((d) => d.verified) ?? [],
        [destinations.data],
    );

    const aliasSettings = useAliasSettingsStore();
    const updateAliasSettings = useAliasSettingsStore((s) => s.updateAliasSettings);
    const copyAlias = useSettingsStore((s) => s.copyAlias);
    const hostname = useUIStore((s) => s.hostname);
    const createFormDraft = useUIStore((s) => s.createFormDraft);
    const setCreateFormDraft = useUIStore((s) => s.setCreateFormDraft);
    const { isOnline } = useOnlineStatus();

    const [aliasPreview, setAliasPreview] = useState<string | null>(null);

    const schema = useMemo(
        () =>
            z
                .object({
                    domain: z.string().min(1, t("invalid_domain")),
                    format: z.enum(AliasFormats, { message: t("invalid_format") }),
                    characterCount: z
                        .number()
                        .min(3, t("invalid_length"))
                        .max(25, t("invalid_length")),
                    wordCount: z
                        .number()
                        .min(1, t("invalid_word_count"))
                        .max(5, t("invalid_word_count")),
                    separator: z.string(),
                    customAlias: z.string(),
                    description: z.string().max(500, t("description_too_long")),
                    prefixFormat: z.enum(AliasPrefixFormats),
                    customPrefix: z.string(),
                    destination: z.string().min(1, t("invalid_destination")),
                })
                // The same rules as the Worker's (and fine for Email Routing).
                .superRefine((values, ctx) => {
                    if (values.format === "custom" && !LOCAL_PART.test(values.customAlias.trim())) {
                        ctx.addIssue({
                            code: "custom",
                            path: ["customAlias"],
                            message: t("invalid_custom_alias"),
                        });
                    }
                    const prefix = values.format !== "custom" && values.prefixFormat === "custom";
                    if (prefix && !PREFIX.test(values.customPrefix.trim())) {
                        ctx.addIssue({
                            code: "custom",
                            path: ["customPrefix"],
                            message: t("invalid_custom_prefix"),
                        });
                    }
                }),
        [t],
    );

    const {
        control,
        handleSubmit,
        watch,
        setValue,
        reset,
        formState: { errors },
    } = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: {
            domain: aliasSettings.domain ?? "",
            format: aliasSettings.format ?? "characters",
            characterCount: aliasSettings.characterCount ?? 5,
            wordCount: aliasSettings.wordCount ?? 2,
            separator: aliasSettings.separator ?? "_",
            customAlias: "",
            description: hostname || "",
            prefixFormat: aliasSettings.prefixFormat ?? "none",
            customPrefix: "",
            destination: aliasSettings.destination ?? "",
        },
    });

    const watchAll = watch();

    useEffect(() => {
        if (open) {
            // Saved values only count while they are still among the options.
            // With all domains listed, the first one.
            const zoneDomain =
                (domains.data?.find((d) => d.zoneId === selectedZoneId) ?? domains.data?.[0])
                    ?.domain ?? "";
            const domainOrZone = (domain: string | undefined) =>
                domain && domains.data?.some((d) => d.domain === domain) ? domain : zoneDomain;
            const confirmedOrFirst = (email: string | undefined) =>
                email && confirmed.some((d) => d.email === email)
                    ? email
                    : (confirmed[0]?.email ?? "");
            if (createFormDraft) {
                // Restore saved draft
                reset({
                    ...createFormDraft,
                    domain: domainOrZone(createFormDraft.domain),
                    destination: confirmedOrFirst(createFormDraft.destination),
                });
            } else {
                // Fresh form from settings
                reset({
                    domain: domainOrZone(aliasSettings.domain),
                    format: aliasSettings.format ?? "characters",
                    characterCount: aliasSettings.characterCount ?? 5,
                    wordCount: aliasSettings.wordCount ?? 2,
                    separator: aliasSettings.separator ?? "_",
                    customAlias: "",
                    description: hostname || "",
                    prefixFormat: hostname ? (aliasSettings.prefixFormat ?? "none") : "none",
                    customPrefix: "",
                    destination: confirmedOrFirst(aliasSettings.destination),
                });
            }
        }
    }, [open]);

    useEffect(() => {
        if (watchAll.destination === "" && confirmed.length > 0) {
            setValue("destination", confirmed[0]?.email ?? "");
        }
    }, [confirmed, watchAll.destination, setValue]);

    // Persist form draft to session storage on change
    useEffect(() => {
        if (open) {
            setCreateFormDraft({
                domain: watchAll.domain,
                format: watchAll.format,
                characterCount: watchAll.characterCount,
                wordCount: watchAll.wordCount,
                separator: watchAll.separator,
                customAlias: watchAll.customAlias,
                description: watchAll.description,
                prefixFormat: watchAll.prefixFormat,
                customPrefix: watchAll.customPrefix,
                destination: watchAll.destination,
            });
        }
    }, [
        open,
        watchAll.domain,
        watchAll.format,
        watchAll.characterCount,
        watchAll.wordCount,
        watchAll.separator,
        watchAll.customAlias,
        watchAll.description,
        watchAll.prefixFormat,
        watchAll.customPrefix,
        watchAll.destination,
        setCreateFormDraft,
    ]);

    function createPreview() {
        const domain = watchAll.domain;
        if (!domain) return null;

        if (watchAll.format === "custom") {
            return watchAll.customAlias.trim() ? `${watchAll.customAlias}@${domain}` : null;
        }

        let address = "";
        for (let i = 0; i < 3; i++) {
            const local = generateAliasAddress({
                format: watchAll.format,
                characterCount: watchAll.characterCount,
                wordCount: watchAll.wordCount,
                separator: watchAll.separator,
                customPrefix: watchAll.customPrefix,
                prefixFormat: watchAll.prefixFormat,
                hostname,
            });
            // "Website Domain" without a website (e.g. on a browser page).
            if (!local) return null;
            address = `${local}@${domain}`;

            if (!aliases.data?.some((a) => a.address === address)) break;
        }

        return address;
    }

    useEffect(() => {
        setAliasPreview(createPreview());
    }, [
        hostname,
        zones.data,
        aliases.data,
        watchAll.domain,
        watchAll.format,
        watchAll.customAlias,
        watchAll.characterCount,
        watchAll.wordCount,
        watchAll.separator,
        watchAll.prefixFormat,
        watchAll.customPrefix,
    ]);

    const previewExists = useMemo(
        () => aliases.data?.some((a) => a.address === aliasPreview) ?? false,
        [aliasPreview, aliases.data],
    );

    // Remembers the current form values as the defaults for the next alias.
    // Runs silently after every successful create; the "Save as Default"
    // button (saveSettings) additionally confirms with a toast.
    function persistSettings() {
        updateAliasSettings({
            domain: watchAll.domain,
            format: watchAll.format,
            characterCount: watchAll.characterCount,
            wordCount: watchAll.wordCount,
            separator: watchAll.separator,
            // Without a website, the prefix was only switched off for this alias.
            prefixFormat: hostname ? watchAll.prefixFormat : aliasSettings.prefixFormat,
            destination: watchAll.destination,
        });
    }

    function saveSettings() {
        persistSettings();
        toast({ body: tc("success"), uniqueID: "alias-settings-saved" });
    }

    function onSubmit(values: z.infer<typeof schema>) {
        const domainInfo = domains.data?.find((d) => d.domain === values.domain);
        if (!domainInfo || !aliasPreview) {
            toast({ body: t("domain_not_found"), type: "error" });
            return;
        }

        if (aliases.data?.some((a) => a.address === aliasPreview)) {
            toast({ body: t("alias_already_exists"), type: "error" });
            return;
        }

        createAlias.mutate(
            {
                zoneId: domainInfo.zoneId,
                address: aliasPreview,
                destination: values.destination,
                description: values.description,
            },
            {
                onSuccess: (alias) => {
                    persistSettings();
                    setCreateFormDraft(null);
                    if (copyAlias) {
                        navigator.clipboard.writeText(alias.address);
                        toast({ body: t("created_and_copied") });
                    } else {
                        toast({ body: t("created_success") });
                    }
                    onClose();
                },
                onError: (error) => {
                    toast({ body: t("creation_error", { error: error.message }), type: "error" });
                },
            },
        );
    }

    const domainOptions = domains.data?.map((d) => ({ value: d.domain, label: d.domain })) ?? [];
    const destinationOptions = confirmed.map((d) => ({ value: d.email, label: d.email }));

    const formatOptions = [
        { value: "characters", label: t("format_characters") },
        { value: "words", label: t("format_words") },
        ...(isExtension ? [{ value: "domain", label: t("format_domain") }] : []),
        { value: "custom", label: t("format_custom") },
    ];

    const prefixOptions =
        watchAll.format === "domain"
            ? [
                  { value: "domainWithoutExtension", label: t("prefix_domain_without_ext") },
                  { value: "domainWithExtension", label: t("prefix_domain_with_ext") },
                  { value: "fullDomain", label: t("prefix_full_domain") },
              ]
            : [
                  { value: "none", label: t("prefix_none") },
                  ...(isExtension
                      ? [
                            {
                                value: "domainWithoutExtension",
                                label: t("prefix_domain_without_ext"),
                            },
                            { value: "domainWithExtension", label: t("prefix_domain_with_ext") },
                            { value: "fullDomain", label: t("prefix_full_domain") },
                        ]
                      : []),
                  { value: "custom", label: t("prefix_custom") },
              ];

    const handleOpenChange = (isOpen: boolean) => !isOpen && onClose();
    const canRegenerate = watchAll.format === "characters" || watchAll.format === "words";

    return (
        <Dialog isOpen={open} onOpenChange={handleOpenChange} purpose="form" width={440}>
            {/* display: contents keeps the form out of the layout, so the Layout below
                still fills the dialog and its content region scrolls. The submit button
                lives in the footer slot but stays inside the form. */}
            <form onSubmit={handleSubmit(onSubmit)} style={{ display: "contents" }}>
                <Layout
                    header={<DialogHeader title={t("title")} onOpenChange={handleOpenChange} />}
                    footer={
                        <LayoutFooter hasDivider>
                            <HStack gap={2} width="100%">
                                <Button
                                    label={t("save_settings")}
                                    width="100%"
                                    onClick={saveSettings}
                                />
                                <Button
                                    type="submit"
                                    variant="primary"
                                    label={tc("create")}
                                    width="100%"
                                    isLoading={createAlias.isPending}
                                    isDisabled={previewExists || !aliasPreview || !isOnline}
                                    tooltip={!isOnline ? tc("offline") : undefined}
                                />
                            </HStack>
                        </LayoutFooter>
                    }
                >
                    <LayoutContent>
                        <VStack gap={3}>
                            <Selector
                                label={t("domain")}
                                options={domainOptions}
                                value={watchAll.domain || undefined}
                                onChange={(v) => setValue("domain", v)}
                                placeholder={t("domain")}
                                status={
                                    errors.domain
                                        ? { type: "error", message: errors.domain.message }
                                        : undefined
                                }
                            />

                            <Selector
                                label={t("alias_format")}
                                options={formatOptions}
                                value={watchAll.format}
                                onChange={(v) => setValue("format", v as typeof watchAll.format)}
                            />

                            {watchAll.format === "characters" && (
                                <Controller
                                    name="characterCount"
                                    control={control}
                                    render={({ field }) => (
                                        <NumberInput
                                            label={t("number_of_chars")}
                                            value={field.value}
                                            onChange={field.onChange}
                                            min={3}
                                            max={25}
                                        />
                                    )}
                                />
                            )}

                            {watchAll.format === "words" && (
                                <Controller
                                    name="wordCount"
                                    control={control}
                                    render={({ field }) => (
                                        <NumberInput
                                            label={t("number_of_words")}
                                            value={field.value}
                                            onChange={field.onChange}
                                            min={1}
                                            max={5}
                                        />
                                    )}
                                />
                            )}

                            {watchAll.format === "custom" && (
                                <Controller
                                    name="customAlias"
                                    control={control}
                                    render={({ field }) => (
                                        <TextInput
                                            label={t("custom_alias")}
                                            value={field.value}
                                            onChange={(value) => field.onChange(value)}
                                            status={
                                                errors.customAlias
                                                    ? {
                                                          type: "error",
                                                          message: errors.customAlias.message,
                                                      }
                                                    : undefined
                                            }
                                        />
                                    )}
                                />
                            )}

                            <Controller
                                name="description"
                                control={control}
                                render={({ field }) => (
                                    <TextInput
                                        label={t("description")}
                                        placeholder={t("description_placeholder")}
                                        value={field.value}
                                        onChange={(value) => field.onChange(value)}
                                        status={
                                            errors.description
                                                ? {
                                                      type: "error",
                                                      message: errors.description.message,
                                                  }
                                                : undefined
                                        }
                                    />
                                )}
                            />

                            {watchAll.format !== "custom" && (
                                <Selector
                                    label={t("prefix")}
                                    options={prefixOptions}
                                    value={watchAll.prefixFormat}
                                    onChange={(v) =>
                                        setValue("prefixFormat", v as typeof watchAll.prefixFormat)
                                    }
                                />
                            )}

                            {watchAll.format !== "custom" && watchAll.prefixFormat === "custom" && (
                                <Controller
                                    name="customPrefix"
                                    control={control}
                                    render={({ field }) => (
                                        <TextInput
                                            label={t("prefix_custom_label")}
                                            value={field.value}
                                            onChange={(value) => field.onChange(value)}
                                            status={
                                                errors.customPrefix
                                                    ? {
                                                          type: "error",
                                                          message: errors.customPrefix.message,
                                                      }
                                                    : undefined
                                            }
                                        />
                                    )}
                                />
                            )}

                            <Selector
                                label={t("destination")}
                                options={destinationOptions}
                                value={watchAll.destination || undefined}
                                onChange={(v) => setValue("destination", v)}
                                placeholder={t("destination")}
                                status={
                                    errors.destination
                                        ? { type: "error", message: errors.destination.message }
                                        : undefined
                                }
                            />

                            <HStack gap={2} align="end">
                                <TextInput
                                    label={t("generated_alias")}
                                    value={aliasPreview ?? t("generated_alias_unavailable")}
                                    isReadOnly
                                    width="100%"
                                    status={
                                        previewExists
                                            ? { type: "error", message: t("alias_already_exists") }
                                            : undefined
                                    }
                                />
                                {canRegenerate && (
                                    <IconButton
                                        label={t("regenerate")}
                                        tooltip={t("regenerate")}
                                        icon={<TbRefresh />}
                                        onClick={() => setAliasPreview(createPreview())}
                                    />
                                )}
                            </HStack>
                        </VStack>
                    </LayoutContent>
                </Layout>
            </form>
        </Dialog>
    );
});
