// Sign-in for the app a Mailflare Worker serves itself: accounts (password,
// magic link, passkey), and the admin token for the Worker's owner.

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Collapsible } from "@astryxdesign/core/Collapsible";
import { HStack } from "@astryxdesign/core/HStack";
import { SegmentedControl, SegmentedControlItem } from "@astryxdesign/core/SegmentedControl";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { VStack } from "@astryxdesign/core/VStack";
import type * as Api from "@mailflare/worker/api";
import { useQuery } from "@tanstack/react-query";
import ky from "ky";
import { type FormEvent, useMemo, useState } from "react";
import { useTranslations } from "use-intl";

import { createAccountClient, signInWith } from "../account/account-client";
import { useAccountErrorMessage } from "../account/use-account-error";
import { useOnlineStatus } from "../hooks/use-online-status";
import { useConnect, WorkerLogin } from "./login";

const MIN_PASSWORD_LENGTH = 8;
const isEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type Notice = { status: "success" | "error"; text: string };

export function AccountLogin({ url }: { url: string }) {
    const t = useTranslations("account");
    const errorMessage = useAccountErrorMessage();
    const { isOnline } = useOnlineStatus();
    const connect = useConnect();
    const client = useMemo(() => createAccountClient(url), [url]);

    const info = useQuery({
        queryKey: ["worker-info", url],
        queryFn: () => ky.get(`${url}/api/info`, { retry: 0 }).json<Api.ApiInfo>(),
        networkMode: "online",
    });

    const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<Notice | null>(null);
    const [showErrors, setShowErrors] = useState(false);

    const emailError = showErrors && !isEmail(email.trim()) ? t("email_invalid") : undefined;
    const passwordError =
        showErrors && password.length < MIN_PASSWORD_LENGTH ? t("password_too_short") : undefined;

    /** Runs one action at a time, turning failures into a notice. */
    async function run(action: string, work: () => Promise<void>) {
        setBusy(action);
        setNotice(null);
        try {
            await work();
        } catch (error) {
            setNotice({ status: "error", text: errorMessage(error, email.trim()) });
        } finally {
            setBusy(null);
        }
    }

    const signedIn = (token: string) => connect.mutateAsync({ kind: "worker", url, token });

    function submit(event: FormEvent) {
        event.preventDefault();
        setShowErrors(true);
        const address = email.trim();
        if (!isEmail(address) || password.length < MIN_PASSWORD_LENGTH) return;

        if (mode === "sign-in") {
            void run("password", async () => {
                const token = await signInWith((fetchOptions) =>
                    client.signIn.email({ email: address, password, fetchOptions }),
                );
                await signedIn(token);
            });
        } else {
            void run("password", async () => {
                const { error } = await client.signUp.email({
                    email: address,
                    password,
                    name: address.split("@")[0] ?? address,
                    callbackURL: "/",
                });
                if (error) throw error;
                setNotice({ status: "success", text: t("sign_up_sent", { email: address }) });
            });
        }
    }

    /** Actions that only need the email address. */
    function withEmail(action: string, send: (address: string) => Promise<unknown>) {
        const address = email.trim();
        if (!isEmail(address)) {
            setShowErrors(true);
            return;
        }
        void run(action, async () => {
            const { error } = (await send(address)) as { error: unknown };
            if (error) throw error;
            setNotice({ status: "success", text: t("link_sent", { email: address }) });
        });
    }

    if (info.isPending) return <Spinner />;
    const accounts = info.data?.accounts;
    // Without accounts (or the Worker unreachable), only the owner can sign in.
    if (!accounts?.enabled) return <WorkerLogin lockedUrl={url} />;

    const disabled = !isOnline || busy !== null;

    return (
        <VStack gap={3}>
            {accounts.publicSignups && (
                <SegmentedControl
                    label={t("sign_in")}
                    value={mode}
                    onChange={(value) => {
                        setMode(value as typeof mode);
                        setNotice(null);
                        setShowErrors(false);
                    }}
                    layout="fill"
                >
                    <SegmentedControlItem value="sign-in" label={t("sign_in")} />
                    <SegmentedControlItem value="sign-up" label={t("sign_up")} />
                </SegmentedControl>
            )}

            {notice && <Banner status={notice.status} title={notice.text} />}

            <form onSubmit={submit} noValidate>
                <VStack gap={3}>
                    <TextInput
                        type="email"
                        label={t("email_label")}
                        autoComplete={mode === "sign-in" ? "username webauthn" : "email"}
                        value={email}
                        onChange={setEmail}
                        isDisabled={disabled}
                        status={emailError ? { type: "error", message: emailError } : undefined}
                    />
                    <TextInput
                        type="password"
                        label={t("password_label")}
                        autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
                        value={password}
                        onChange={setPassword}
                        isDisabled={disabled}
                        status={
                            passwordError ? { type: "error", message: passwordError } : undefined
                        }
                    />
                    <Button
                        type="submit"
                        variant="primary"
                        width="100%"
                        label={mode === "sign-in" ? t("sign_in") : t("sign_up")}
                        isLoading={busy === "password"}
                        isDisabled={disabled}
                    />
                </VStack>
            </form>

            {mode === "sign-in" && (
                <>
                    <Button
                        width="100%"
                        label={t("passkey")}
                        isLoading={busy === "passkey"}
                        isDisabled={disabled}
                        onClick={() =>
                            void run("passkey", async () => {
                                const token = await signInWith((fetchOptions) =>
                                    client.signIn.passkey({ fetchOptions }),
                                );
                                await signedIn(token);
                            })
                        }
                    />
                    <HStack gap={2} justify="center">
                        <Button
                            variant="ghost"
                            size="sm"
                            label={t("magic_link")}
                            isLoading={busy === "magic-link"}
                            isDisabled={disabled}
                            onClick={() =>
                                withEmail("magic-link", (address) =>
                                    client.signIn.magicLink({
                                        email: address,
                                        callbackURL: "/",
                                        errorCallbackURL: "/",
                                    }),
                                )
                            }
                        />
                        <Button
                            variant="ghost"
                            size="sm"
                            label={t("forgot_password")}
                            isLoading={busy === "reset"}
                            isDisabled={disabled}
                            onClick={() =>
                                withEmail("reset", (address) =>
                                    client.requestPasswordReset({
                                        email: address,
                                        redirectTo: "/reset-password",
                                    }),
                                )
                            }
                        />
                    </HStack>
                </>
            )}

            <Collapsible
                defaultIsOpen={false}
                trigger={<Text weight="medium">{t("admin_token")}</Text>}
            >
                <WorkerLogin lockedUrl={url} />
            </Collapsible>
        </VStack>
    );
}
