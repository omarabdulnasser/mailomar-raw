// Worker app: the signed-in account. Password, passkeys (which belong to the
// Worker's domain), signed-in devices, and deleting the account.

import { AlertDialog } from "@astryxdesign/core/AlertDialog";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, type ReactNode, useMemo, useState } from "react";
import { TbKey, TbLogout, TbTrash } from "react-icons/tb";
import { useFormatter, useTranslations } from "use-intl";
import { useLocation } from "wouter";

import { type AccountClient, createAccountClient, unwrap } from "../../account/account-client";
import { useAccountErrorMessage } from "../../account/use-account-error";
import { useCloudflareConfig } from "../../api/config-context";
import { useMailflare } from "../../backend/use-mailflare";
import { useStorage } from "../../storage/context";
import { StorageKeys } from "../../storage/storage";
import { useAuthStore } from "../../stores/auth-store";
import { PageBody, PageHeader } from "./page-header";

const MIN_PASSWORD_LENGTH = 8;

/** "Firefox on Windows" from a user agent; good enough to recognize a device. */
function describeDevice(userAgent: string | null | undefined): string | null {
    if (!userAgent) return null;
    if (!userAgent.includes("Mozilla/")) return userAgent;
    const browser =
        [
            ["Edg/", "Edge"],
            ["Firefox/", "Firefox"],
            ["Chrome/", "Chrome"],
            ["Safari/", "Safari"],
        ].find(([token]) => userAgent.includes(token!))?.[1] ?? null;
    const os =
        [
            ["Android", "Android"],
            ["iPhone", "iPhone"],
            ["iPad", "iPad"],
            ["Windows", "Windows"],
            ["Mac OS", "macOS"],
            ["Linux", "Linux"],
        ].find(([token]) => userAgent.includes(token!))?.[1] ?? null;
    return [browser, os].filter(Boolean).join(" on ") || null;
}

function Section({
    title,
    description,
    action,
    children,
}: {
    title: string;
    description?: string;
    action?: ReactNode;
    children?: ReactNode;
}) {
    return (
        <VStack gap={2}>
            <HStack justify="between" align="center" gap={2}>
                <VStack gap={0.5}>
                    <Text weight="medium">{title}</Text>
                    {description && <Text type="supporting">{description}</Text>}
                </VStack>
                {action}
            </HStack>
            {children}
        </VStack>
    );
}

function useAccountAction() {
    const toast = useToast();
    const errorMessage = useAccountErrorMessage();
    return async (work: () => Promise<unknown>, success?: string) => {
        try {
            await work();
            if (success) toast({ body: success });
            return true;
        } catch (error) {
            toast({ body: errorMessage(error), type: "error" });
            return false;
        }
    };
}

function PasswordSection({ client, email }: { client: AccountClient; email: string }) {
    const t = useTranslations("account");
    const run = useAccountAction();
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [busy, setBusy] = useState(false);

    // Accounts made with a magic link or passkey have no password yet.
    const accounts = useQuery({
        queryKey: ["account-credentials", email],
        networkMode: "online",
        queryFn: async () => (await unwrap(client.listAccounts())).data ?? [],
    });
    const hasPassword = accounts.data?.some((account) => account.providerId === "credential");

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!current || next.length < MIN_PASSWORD_LENGTH) return;
        setBusy(true);
        // Signs out every other device, in case someone else got into the
        // account; this one continues with the new session it gets back.
        const changed = await run(async () => {
            const { data } = await unwrap(
                client.changePassword({
                    currentPassword: current,
                    newPassword: next,
                    revokeOtherSessions: true,
                }),
            );
            if (data?.token) useAuthStore.getState().replaceToken(data.token);
        }, t("page.password_changed"));
        if (changed) {
            setCurrent("");
            setNext("");
        }
        setBusy(false);
    }

    if (accounts.isPending) return <Spinner />;
    if (!hasPassword) {
        return (
            <Section
                title={t("page.password_title")}
                description={t("page.no_password")}
                action={
                    <Button
                        size="sm"
                        label={t("page.set_password")}
                        clickAction={async () => {
                            await run(
                                () =>
                                    unwrap(
                                        client.requestPasswordReset({
                                            email,
                                            redirectTo: "/reset-password",
                                        }),
                                    ),
                                t("page.set_password_sent", { email }),
                            );
                        }}
                    />
                }
            />
        );
    }

    return (
        <Section title={t("page.password_title")}>
            <form onSubmit={submit}>
                <VStack gap={2}>
                    <TextInput
                        type="password"
                        label={t("page.current_password")}
                        autoComplete="current-password"
                        value={current}
                        onChange={setCurrent}
                    />
                    <TextInput
                        type="password"
                        label={t("page.new_password")}
                        autoComplete="new-password"
                        value={next}
                        onChange={setNext}
                        status={
                            next.length > 0 && next.length < MIN_PASSWORD_LENGTH
                                ? { type: "error", message: t("password_too_short") }
                                : undefined
                        }
                    />
                    <HStack justify="end">
                        <Button
                            type="submit"
                            label={t("page.change_password")}
                            isLoading={busy}
                            isDisabled={!current || next.length < MIN_PASSWORD_LENGTH}
                        />
                    </HStack>
                </VStack>
            </form>
        </Section>
    );
}

function PasskeysSection({ client }: { client: AccountClient }) {
    const t = useTranslations("account");
    const format = useFormatter();
    const run = useAccountAction();
    const queryClient = useQueryClient();
    const key = ["account-passkeys"];
    const passkeys = useQuery({
        queryKey: key,
        networkMode: "online",
        queryFn: async () => (await unwrap(client.passkey.listUserPasskeys())).data ?? [],
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });

    return (
        <Section
            title={t("passkeys.title")}
            action={
                <Button
                    size="sm"
                    label={t("passkeys.action")}
                    icon={<TbKey />}
                    clickAction={async () => {
                        await run(() => unwrap(client.passkey.addPasskey()), t("passkeys.success"));
                        await refresh();
                    }}
                />
            }
        >
            {passkeys.isPending && <Spinner />}
            {passkeys.data?.length === 0 && (
                <Text type="supporting">{t("page.passkeys_empty")}</Text>
            )}
            {passkeys.data?.map((passkey) => (
                <HStack key={passkey.id} gap={2} align="center">
                    <Text maxLines={1} style={{ flex: 1, minWidth: 0 }}>
                        {passkey.name ||
                            t("page.passkey_unnamed", {
                                date: format.dateTime(new Date(passkey.createdAt), {
                                    dateStyle: "medium",
                                }),
                            })}
                    </Text>
                    <IconButton
                        variant="ghost"
                        size="sm"
                        label={t("page.delete_passkey")}
                        tooltip={t("page.delete_passkey")}
                        icon={<TbTrash />}
                        clickAction={async () => {
                            await run(
                                () => unwrap(client.passkey.deletePasskey({ id: passkey.id })),
                                t("page.passkey_removed"),
                            );
                            await refresh();
                        }}
                    />
                </HStack>
            ))}
        </Section>
    );
}

function SessionsSection({
    client,
    currentToken,
}: {
    client: AccountClient;
    currentToken: string;
}) {
    const t = useTranslations("account");
    const format = useFormatter();
    const run = useAccountAction();
    const queryClient = useQueryClient();
    const key = ["account-sessions"];
    const sessions = useQuery({
        queryKey: key,
        networkMode: "online",
        queryFn: async () => (await unwrap(client.listSessions())).data ?? [],
    });
    const refresh = () => queryClient.invalidateQueries({ queryKey: key });
    // Bearer tokens may carry a signature after the session token ("token.signature").
    const current = currentToken.split(".")[0];
    const others = sessions.data?.filter((session) => session.token !== current) ?? [];

    return (
        <Section
            title={t("page.sessions_title")}
            description={t("page.sessions_description")}
            action={
                others.length > 0 && (
                    <Button
                        size="sm"
                        label={t("page.sign_out_others")}
                        clickAction={async () => {
                            await run(
                                () => unwrap(client.revokeOtherSessions()),
                                t("page.signed_out_others"),
                            );
                            await refresh();
                        }}
                    />
                )
            }
        >
            {sessions.isPending && <Spinner />}
            {sessions.data?.map((session) => {
                const isCurrent = session.token === current;
                return (
                    <HStack key={session.id} gap={2} align="center">
                        <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
                            <Text maxLines={1}>
                                {describeDevice(session.userAgent) ?? t("page.unknown_device")}
                            </Text>
                            <Text type="supporting">
                                {t("page.signed_in_at", {
                                    date: format.dateTime(new Date(session.createdAt), {
                                        dateStyle: "medium",
                                        timeStyle: "short",
                                    }),
                                })}
                            </Text>
                        </VStack>
                        {isCurrent ? (
                            <Badge label={t("page.this_device")} />
                        ) : (
                            <IconButton
                                variant="ghost"
                                size="sm"
                                label={t("page.sign_out_device")}
                                tooltip={t("page.sign_out_device")}
                                icon={<TbLogout />}
                                clickAction={async () => {
                                    await run(
                                        () =>
                                            unwrap(client.revokeSession({ token: session.token })),
                                        t("page.signed_out_device"),
                                    );
                                    await refresh();
                                }}
                            />
                        )}
                    </HStack>
                );
            })}
        </Section>
    );
}

function DeleteSection({ client }: { client: AccountClient }) {
    const t = useTranslations("account");
    const tc = useTranslations("common");
    const run = useAccountAction();
    const queryClient = useQueryClient();
    const storage = useStorage();
    const logout = useAuthStore((s) => s.logout);
    const [, navigate] = useLocation();
    const [password, setPassword] = useState("");
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

    async function remove() {
        setBusy(true);
        const deleted = await run(
            () => unwrap(client.deleteUser(password ? { password } : {})),
            t("page.deleted"),
        );
        setBusy(false);
        setConfirming(false);
        if (!deleted) return;
        navigate("/", { replace: true });
        logout();
        queryClient.clear();
        await storage.remove(StorageKeys.QueryCache);
    }

    return (
        <Section title={t("page.delete_title")} description={t("page.delete_description")}>
            <HStack gap={2} align="end">
                <TextInput
                    type="password"
                    label={t("page.delete_password")}
                    autoComplete="current-password"
                    value={password}
                    onChange={setPassword}
                    width="100%"
                />
                <Button
                    variant="destructive"
                    label={t("page.delete_action")}
                    icon={<TbTrash />}
                    style={{ flexShrink: 0 }}
                    onClick={() => setConfirming(true)}
                />
            </HStack>
            <AlertDialog
                isOpen={confirming}
                onOpenChange={setConfirming}
                title={t("page.delete_confirm_title")}
                description={t("page.delete_confirm_description")}
                actionLabel={t("page.delete_action")}
                actionVariant="destructive"
                cancelLabel={tc("no")}
                isActionLoading={busy}
                onAction={remove}
                width={360}
            />
        </Section>
    );
}

export function AccountPage() {
    const t = useTranslations("account");
    const tn = useTranslations("nav");
    const { lockedWorkerUrl } = useCloudflareConfig();
    const apiToken = useAuthStore((s) => s.apiToken);
    const { account } = useMailflare();

    const client = useMemo(
        () => (lockedWorkerUrl && apiToken ? createAccountClient(lockedWorkerUrl, apiToken) : null),
        [lockedWorkerUrl, apiToken],
    );
    const email = account.data?.user?.email;
    if (!client || !apiToken || !email) return <Spinner />;

    return (
        <PageBody>
            <PageHeader title={tn("account")} description={t("page.description", { email })} />
            <PasswordSection client={client} email={email} />
            <Divider />
            <PasskeysSection client={client} />
            <Divider />
            <SessionsSection client={client} currentToken={apiToken} />
            <Divider />
            <DeleteSection client={client} />
        </PageBody>
    );
}
