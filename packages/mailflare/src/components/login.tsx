import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { Link } from "@astryxdesign/core/Link";
import { List, ListItem } from "@astryxdesign/core/List";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslations } from "use-intl";
import { z } from "zod";

import { useCloudflareConfig } from "../api/config-context";
import { verifyConnection } from "../backend/create-backend";
import type { BackendKind, Connection } from "../backend/types";
import { normalizeWorkerUrl } from "../backend/worker-backend";
import { GITHUB_LINK } from "../const";
import { useOnlineStatus } from "../hooks/use-online-status";
import { useAuthStore } from "../stores/auth-store";

const TOKEN_PERMISSIONS = [
    "Account | Email Routing Addresses | Read",
    "Zone | Email Routing Rules | Edit",
    "Zone | Zone | Read",
    "Zone | Zone Settings | Read",
];

const WORKER_GUIDE_LINK = `${GITHUB_LINK}/blob/main/docs/guides/worker-mode.md`;

/** Verifies a connection and logs in with it; rejects with a readable message. */
export function useConnect() {
    const { apiBaseUrl } = useCloudflareConfig();
    const queryClient = useQueryClient();
    const connect = useAuthStore((s) => s.connect);

    return useMutation({
        mutationKey: ["connect"],
        mutationFn: async (connection: Connection) => {
            const error = await verifyConnection(connection, apiBaseUrl);
            if (error) throw new Error(error);
            // Never show data cached for a previous connection.
            queryClient.getQueryCache().clear();
            connect(connection);
        },
    });
}

function CloudflareLogin() {
    const t = useTranslations("login");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const { isPending, mutate } = useConnect();

    const schema = z.object({ token: z.string().trim().min(1, t("token_required")) });
    const {
        control,
        handleSubmit,
        formState: { errors },
    } = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { token: "" },
    });

    return (
        <form
            onSubmit={handleSubmit(({ token }) =>
                mutate(
                    { kind: "cloudflare", token },
                    {
                        onError: (error) =>
                            toast({
                                body: t("login_error", { error: error.message }),
                                type: "error",
                            }),
                    },
                ),
            )}
        >
            <VStack gap={3}>
                <Controller
                    name="token"
                    control={control}
                    render={({ field }) => (
                        <TextInput
                            type="password"
                            label={t("token_label")}
                            placeholder={t("token_placeholder")}
                            autoComplete="off"
                            value={field.value}
                            onChange={(value) => field.onChange(value)}
                            isDisabled={isPending}
                            status={
                                errors.token
                                    ? { type: "error", message: errors.token.message }
                                    : undefined
                            }
                        />
                    )}
                />

                <Button
                    type="submit"
                    variant="primary"
                    width="100%"
                    label={isOnline ? t("save_token") : t("offline_login")}
                    isLoading={isPending}
                    isDisabled={!isOnline}
                />

                <Collapsible trigger={<Text weight="medium">{t("instructions.title")}</Text>}>
                    <List listStyle="decimal" density="compact">
                        <ListItem
                            label={
                                <Link
                                    href="https://dash.cloudflare.com/profile/api-tokens/"
                                    isExternalLink
                                >
                                    {t("instructions.step_1")}
                                </Link>
                            }
                        />
                        <ListItem label={<Text>{t("instructions.step_2")}</Text>} />
                        <ListItem label={<Text>{t("instructions.step_3")}</Text>} />
                        <ListItem
                            label={<Text>{t("instructions.step_4")}</Text>}
                            description={
                                <List listStyle="disc" density="compact">
                                    {TOKEN_PERMISSIONS.map((permission) => (
                                        <ListItem
                                            key={permission}
                                            label={<Text type="code">{permission}</Text>}
                                        />
                                    ))}
                                </List>
                            }
                        />
                        {(["step_5", "step_6", "step_7", "step_8", "step_9"] as const).map(
                            (step) => (
                                <ListItem
                                    key={step}
                                    label={<Text>{t(`instructions.${step}`)}</Text>}
                                />
                            ),
                        )}
                    </List>
                </Collapsible>
            </VStack>
        </form>
    );
}

export function WorkerLogin({ lockedUrl }: { lockedUrl?: string } = {}) {
    const t = useTranslations("login");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const { isPending, mutate } = useConnect();
    const { connectWorkerAccount } = useCloudflareConfig();
    const [connectingAccount, setConnectingAccount] = useState(false);

    const schema = z.object({
        url: z
            .string()
            .trim()
            .refine((value) => {
                try {
                    normalizeWorkerUrl(value);
                    return true;
                } catch {
                    return false;
                }
            }, t("worker_url_invalid")),
        token: z.string().trim().min(1, t("token_required")),
    });
    const {
        control,
        handleSubmit,
        trigger,
        getValues,
        formState: { errors },
    } = useForm<z.infer<typeof schema>>({
        resolver: zodResolver(schema),
        defaultValues: { url: lockedUrl ?? "", token: "" },
    });

    const onError = (error: Error) =>
        toast({ body: t("worker_error", { error: error.message }), type: "error" });

    /** Signs in with an account through the Worker's own app (the extension). */
    async function signInWithAccount() {
        if (!connectWorkerAccount || !(await trigger("url"))) return;
        const url = normalizeWorkerUrl(getValues("url"));
        setConnectingAccount(true);
        try {
            const token = await connectWorkerAccount(url);
            mutate({ kind: "worker", url, token }, { onError });
        } catch (error) {
            onError(error instanceof Error ? error : new Error(String(error)));
        } finally {
            setConnectingAccount(false);
        }
    }

    return (
        <form
            onSubmit={handleSubmit(({ url, token }) =>
                mutate({ kind: "worker", url: normalizeWorkerUrl(url), token }, { onError }),
            )}
        >
            <VStack gap={3}>
                {!lockedUrl && (
                    <Controller
                        name="url"
                        control={control}
                        render={({ field }) => (
                            <TextInput
                                type="url"
                                label={t("worker_url_label")}
                                placeholder={t("worker_url_placeholder")}
                                autoComplete="url"
                                value={field.value}
                                onChange={(value) => field.onChange(value)}
                                isDisabled={isPending}
                                status={
                                    errors.url
                                        ? { type: "error", message: errors.url.message }
                                        : undefined
                                }
                            />
                        )}
                    />
                )}
                <Controller
                    name="token"
                    control={control}
                    render={({ field }) => (
                        <TextInput
                            type="password"
                            label={t("worker_token_label")}
                            placeholder={t("worker_token_placeholder")}
                            autoComplete="off"
                            value={field.value}
                            onChange={(value) => field.onChange(value)}
                            isDisabled={isPending}
                            status={
                                errors.token
                                    ? { type: "error", message: errors.token.message }
                                    : undefined
                            }
                        />
                    )}
                />

                <Button
                    type="submit"
                    variant="primary"
                    width="100%"
                    label={isOnline ? t("connect") : t("offline_login")}
                    isLoading={isPending}
                    isDisabled={!isOnline}
                />

                {connectWorkerAccount && !lockedUrl && (
                    <Button
                        width="100%"
                        label={t("worker_account")}
                        tooltip={t("worker_account_hint")}
                        isLoading={connectingAccount}
                        isDisabled={!isOnline || isPending}
                        onClick={() => void signInWithAccount()}
                    />
                )}

                {!lockedUrl && (
                    <Text type="supporting">
                        {t("worker_intro")}{" "}
                        <Link href={WORKER_GUIDE_LINK} isExternalLink>
                            {t("worker_guide")}
                        </Link>
                    </Text>
                )}
            </VStack>
        </form>
    );
}

export function Login() {
    const t = useTranslations("login");
    const [mode, setMode] = useState<BackendKind>("cloudflare");

    return (
        <VStack gap={3}>
            <SegmentedControl
                label={t("mode_label")}
                value={mode}
                onChange={(value) => setMode(value as BackendKind)}
                layout="fill"
            >
                <SegmentedControlItem value="cloudflare" label={t("mode_cloudflare")} />
                <SegmentedControlItem value="worker" label={t("mode_worker")} />
            </SegmentedControl>
            {mode === "cloudflare" ? <CloudflareLogin /> : <WorkerLogin />}
        </VStack>
    );
}
