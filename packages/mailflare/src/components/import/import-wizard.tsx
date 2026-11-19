import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { CheckboxInput } from "@astryxdesign/core/CheckboxInput";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { List, ListItem } from "@astryxdesign/core/List";
import { ProgressBar } from "@astryxdesign/core/ProgressBar";
import { Selector } from "@astryxdesign/core/Selector";
import { Step, Stepper } from "@astryxdesign/core/Stepper";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";
import { TbArrowLeft, TbArrowRight, TbX } from "react-icons/tb";
import { useTranslations } from "use-intl";

import type { ImportedAlias, ImportResult, ImportService } from "../../api/import";
import { useImport } from "../../api/import";
import { queryKeys, useMailflare } from "../../backend/use-mailflare";

type Step = "service" | "preview" | "target" | "progress" | "summary";

const STEP_INDEX: Record<Step, number> = {
    service: 0,
    preview: 1,
    target: 2,
    progress: 3,
    summary: 4,
};

/** The import from addy.io or SimpleLogin; `standalone` adds its own heading and margins. */
export function ImportWizard({ standalone = true }: { standalone?: boolean }) {
    const t = useTranslations("import");
    const tc = useTranslations("common");
    const queryClient = useQueryClient();
    const { backend, domains, destinations } = useMailflare();
    const { progress, fetchAliases, verifyServiceToken, importAliases, abort, reset } = useImport();

    const [step, setStep] = useState<Step>("service");
    const [service, setService] = useState<ImportService>("addy");
    const [serviceToken, setServiceToken] = useState("");
    const [tokenError, setTokenError] = useState("");
    const [verifying, setVerifying] = useState(false);
    const [aliases, setAliases] = useState<ImportedAlias[]>([]);
    const [selectedEmails, setSelectedEmails] = useState<Set<string>>(new Set());
    const [targetDestination, setTargetDestination] = useState("");
    // Aliases turned off at the other service are usually not worth bringing over.
    const [onlyEnabled, setOnlyEnabled] = useState(true);
    const [result, setResult] = useState<ImportResult | null>(null);

    // Every domain aliases can be created on, Email Routing subdomains included.
    const domainToZoneId: Record<string, string> = {};
    for (const d of domains.data ?? []) domainToZoneId[d.domain.toLowerCase()] = d.zoneId;
    const importable = (alias: ImportedAlias) => alias.domain.toLowerCase() in domainToZoneId;
    const selectable = (alias: ImportedAlias) =>
        importable(alias) && (!onlyEnabled || alias.enabled);
    const matchingAliases = aliases.filter(selectable);
    const nonMatchingCount = aliases.length - matchingAliases.length;

    const handleVerifyAndFetch = useCallback(async () => {
        setTokenError("");
        setVerifying(true);
        try {
            const valid = await verifyServiceToken(service, serviceToken);
            if (!valid) {
                setTokenError(t("invalid_token"));
                setVerifying(false);
                return;
            }
            const fetched = await fetchAliases(service, serviceToken);
            setAliases(fetched);
            setSelectedEmails(new Set(fetched.filter(selectable).map((a) => a.email)));
            setVerifying(false);
            if (fetched.length > 0) setStep("preview");
            else setTokenError(t("no_aliases_found"));
        } catch {
            setTokenError(t("fetch_error"));
            setVerifying(false);
        }
    }, [service, serviceToken, verifyServiceToken, fetchAliases, domains.data, onlyEnabled, t]);

    /** Turning it on unselects disabled aliases; turning it off selects them. */
    const changeOnlyEnabled = (value: boolean) => {
        setOnlyEnabled(value);
        const disabled = aliases.filter((a) => importable(a) && !a.enabled).map((a) => a.email);
        setSelectedEmails((prev) => {
            const next = new Set(prev);
            for (const email of disabled) {
                if (value) next.delete(email);
                else next.add(email);
            }
            return next;
        });
    };

    const toggleAlias = useCallback((email: string) => {
        setSelectedEmails((prev) => {
            const next = new Set(prev);
            if (next.has(email)) next.delete(email);
            else next.add(email);
            return next;
        });
    }, []);

    const allMatchingSelected = matchingAliases.every((a) => selectedEmails.has(a.email));

    const toggleAll = useCallback(() => {
        const matchingEmails = matchingAliases.map((a) => a.email);
        if (allMatchingSelected) {
            setSelectedEmails((prev) => {
                const next = new Set(prev);
                for (const e of matchingEmails) next.delete(e);
                return next;
            });
        } else {
            setSelectedEmails((prev) => new Set([...prev, ...matchingEmails]));
        }
    }, [matchingAliases, allMatchingSelected]);

    const handleImport = useCallback(async () => {
        if (!backend || !targetDestination) return;
        setStep("progress");
        const toImport = aliases.filter((a) => selectedEmails.has(a.email));
        const importResult = await importAliases(
            toImport,
            backend,
            domainToZoneId,
            targetDestination,
        );
        // The alias list doesn't have them yet.
        await queryClient.invalidateQueries({ queryKey: queryKeys.aliases() });
        setResult(importResult);
        setStep("summary");
    }, [backend, targetDestination, aliases, selectedEmails, domains.data, importAliases]);

    const handleStartOver = useCallback(() => {
        reset();
        setStep("service");
        setServiceToken("");
        setTokenError("");
        setAliases([]);
        setSelectedEmails(new Set());
        setTargetDestination("");
        setResult(null);
    }, [reset]);

    const selected = aliases.filter((a) => selectedEmails.has(a.email));
    const perDomain = new Map<string, number>();
    for (const a of selected) {
        const d = a.domain.toLowerCase();
        perDomain.set(d, (perDomain.get(d) ?? 0) + 1);
    }
    // Email Routing allows 200 rules per domain; the Worker has no limit.
    const overLimit =
        backend?.kind === "cloudflare" ? [...perDomain.entries()].filter(([, c]) => c > 200) : [];

    return (
        <VStack
            gap={4}
            maxWidth={600}
            {...(standalone && { padding: 4 })}
            style={{ marginInline: standalone ? "auto" : undefined }}
        >
            {standalone && <Heading level={1}>{t("title")}</Heading>}

            <Stepper activeStep={STEP_INDEX[step]} density="compact">
                <Step step={0} label={t("steps.service")} />
                <Step step={1} label={t("steps.preview")} />
                <Step step={2} label={t("steps.target")} />
                <Step step={3} label={t("steps.import")} />
            </Stepper>

            {/* STEP 1: Select service + enter token */}
            {step === "service" && (
                <VStack gap={3}>
                    <Selector
                        label={t("select_service")}
                        value={service}
                        onChange={(v) => setService(v as ImportService)}
                        options={[
                            { value: "addy", label: "addy.io (AnonAddy)" },
                            { value: "simplelogin", label: "SimpleLogin" },
                        ]}
                    />

                    <TextInput
                        type="password"
                        label={t("enter_token")}
                        placeholder={t("token_placeholder")}
                        autoComplete="off"
                        value={serviceToken}
                        onChange={setServiceToken}
                        onEnter={() => serviceToken.trim() && void handleVerifyAndFetch()}
                        status={tokenError ? { type: "error", message: tokenError } : undefined}
                    />

                    <Button
                        variant="primary"
                        label={t("verify_and_fetch")}
                        endContent={<TbArrowRight />}
                        isDisabled={!serviceToken.trim()}
                        isLoading={verifying || progress.status === "fetching"}
                        onClick={handleVerifyAndFetch}
                    />
                </VStack>
            )}

            {/* STEP 2: Preview fetched aliases */}
            {step === "preview" && (
                <VStack gap={3}>
                    <HStack justify="between" align="center">
                        <Text weight="medium">{t("fetched_count", { count: aliases.length })}</Text>
                        <Button
                            variant="ghost"
                            size="sm"
                            label={allMatchingSelected ? t("deselect_all") : t("select_all")}
                            onClick={toggleAll}
                        />
                    </HStack>

                    <Switch
                        label={t("only_enabled")}
                        description={t("only_enabled_hint", {
                            service: service === "addy" ? "addy.io" : "SimpleLogin",
                        })}
                        value={onlyEnabled}
                        onChange={changeOnlyEnabled}
                    />

                    <Card padding={1}>
                        <div style={{ maxHeight: 400, overflowY: "auto" }}>
                            <List density="compact" hasDividers>
                                {aliases.map((alias) => {
                                    const canImport = selectable(alias);
                                    return (
                                        <ListItem
                                            key={alias.email}
                                            isDisabled={!canImport}
                                            startContent={
                                                <CheckboxInput
                                                    size="sm"
                                                    label={alias.email}
                                                    isLabelHidden
                                                    value={selectedEmails.has(alias.email)}
                                                    onChange={() => toggleAlias(alias.email)}
                                                    isDisabled={!canImport}
                                                />
                                            }
                                            label={alias.email}
                                            description={alias.description || undefined}
                                            endContent={
                                                <Badge
                                                    variant={alias.enabled ? "success" : "neutral"}
                                                    label={
                                                        alias.enabled
                                                            ? tc("enabled")
                                                            : tc("disabled")
                                                    }
                                                />
                                            }
                                        />
                                    );
                                })}
                            </List>
                        </div>
                    </Card>

                    {nonMatchingCount > 0 && (
                        <Banner
                            status="info"
                            title={t("non_matching_zones", { count: nonMatchingCount })}
                        />
                    )}

                    <HStack gap={2}>
                        <Button
                            width="100%"
                            label={t("back")}
                            icon={<TbArrowLeft />}
                            onClick={() => setStep("service")}
                        />
                        <Button
                            width="100%"
                            variant="primary"
                            label={t("next")}
                            endContent={<TbArrowRight />}
                            isDisabled={selectedEmails.size === 0}
                            onClick={() => setStep("target")}
                        />
                    </HStack>
                </VStack>
            )}

            {/* STEP 3: Select destination */}
            {step === "target" && (
                <VStack gap={3}>
                    <Selector
                        label={t("select_destination")}
                        value={targetDestination || undefined}
                        onChange={setTargetDestination}
                        placeholder={t("destination_placeholder")}
                        options={
                            // Aliases can only forward to confirmed mailboxes.
                            destinations.data
                                ?.filter((d) => d.verified)
                                .map((d) => ({ value: d.email, label: d.email })) ?? []
                        }
                    />

                    <Text type="supporting">
                        {t("will_import_total", { count: selected.length })}
                    </Text>

                    {overLimit.length > 0 && (
                        <Banner
                            status="warning"
                            title={t("rule_limit_warning", {
                                domains: overLimit.map(([d, c]) => `${d} (${c})`).join(", "),
                            })}
                        />
                    )}

                    <HStack gap={2}>
                        <Button
                            width="100%"
                            label={t("back")}
                            icon={<TbArrowLeft />}
                            onClick={() => setStep("preview")}
                        />
                        <Button
                            width="100%"
                            variant="primary"
                            label={t("start_import")}
                            endContent={<TbArrowRight />}
                            isDisabled={!targetDestination}
                            onClick={handleImport}
                        />
                    </HStack>
                </VStack>
            )}

            {/* STEP 4: Import progress */}
            {step === "progress" && (
                <VStack gap={3}>
                    <ProgressBar
                        label={t("importing")}
                        value={progress.completed}
                        max={Math.max(progress.total, 1)}
                        formatValueLabel={() =>
                            t("progress_count", {
                                completed: progress.completed,
                                total: progress.total,
                            })
                        }
                        hasValueLabel
                    />
                    {progress.failed > 0 && (
                        <Banner
                            status="error"
                            title={t("failed_count", { count: progress.failed })}
                        />
                    )}
                    <Button
                        variant="destructive"
                        label={t("abort")}
                        icon={<TbX />}
                        onClick={abort}
                    />
                </VStack>
            )}

            {/* STEP 5: Summary */}
            {step === "summary" && result && (
                <VStack gap={3}>
                    <Banner
                        status={result.failed > 0 ? "warning" : "success"}
                        title={t("imported_count", { count: result.imported })}
                        description={
                            [
                                result.skipped > 0
                                    ? t("skipped_count", { count: result.skipped })
                                    : null,
                                result.failed > 0
                                    ? t("summary_failed", { count: result.failed })
                                    : null,
                            ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                        }
                        collapsible={false}
                    >
                        {result.errors.length > 0 && (
                            <div style={{ maxHeight: 200, overflowY: "auto" }}>
                                <VStack gap={1}>
                                    {result.errors.map((err) => (
                                        <Text key={err} type="code" size="xsm">
                                            {err}
                                        </Text>
                                    ))}
                                </VStack>
                            </div>
                        )}
                    </Banner>

                    <Button variant="primary" label={t("start_over")} onClick={handleStartOver} />
                </VStack>
            )}
        </VStack>
    );
}
