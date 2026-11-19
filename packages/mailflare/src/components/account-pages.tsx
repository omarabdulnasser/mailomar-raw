// Pages that links in the Worker's emails open, when the Worker serves the app.

import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { TextInput } from "@astryxdesign/core/TextInput";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useQuery } from "@tanstack/react-query";
import { isHTTPError } from "ky";
import { type FormEvent, useState } from "react";
import { useTranslations } from "use-intl";

import {
    createAccountClient,
    createAppSession,
    sessionFromCookie,
    unwrap,
    verifyAccountEmail,
    verifyDestination,
} from "../account/account-client";
import { useAccountErrorMessage } from "../account/use-account-error";
import { WorkerBackend } from "../backend/worker-backend";
import { useConnect } from "./login";

type PageProps = { url: string; token: string; onDone: () => void };

/** Opened from a password reset email (`/reset-password?token=`). */
export function ResetPasswordPage({ url, token, onDone }: PageProps) {
    const t = useTranslations("account");
    const toast = useToast();
    const errorMessage = useAccountErrorMessage();
    const [password, setPassword] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const tooShort = password.length > 0 && password.length < 8;

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (password.length < 8) return;
        setBusy(true);
        setError(null);
        try {
            await unwrap(createAccountClient(url).resetPassword({ newPassword: password, token }));
            toast({ body: t("reset.success") });
            onDone();
        } catch (failure) {
            setError(errorMessage(failure));
        } finally {
            setBusy(false);
        }
    }

    return (
        <form onSubmit={submit} noValidate>
            <VStack gap={3}>
                <Heading level={2}>{t("reset.title")}</Heading>
                {error && <Banner status="error" title={error} />}
                <TextInput
                    type="password"
                    label={t("reset.password_label")}
                    autoComplete="new-password"
                    value={password}
                    onChange={setPassword}
                    isDisabled={busy}
                    status={
                        tooShort ? { type: "error", message: t("password_too_short") } : undefined
                    }
                />
                <Button
                    type="submit"
                    variant="primary"
                    width="100%"
                    label={t("reset.submit")}
                    isLoading={busy}
                    isDisabled={password.length < 8}
                />
            </VStack>
        </form>
    );
}

/**
 * Opened from a destination's confirmation email (`/verify-destination?token=`).
 * Confirming takes a click, so link scanners in mailboxes can't confirm.
 */
export function VerifyDestinationPage({ url, token, onDone }: PageProps) {
    const t = useTranslations("account");
    const errorMessage = useAccountErrorMessage();
    const [state, setState] = useState<"idle" | "busy" | "done">("idle");
    const [error, setError] = useState<string | null>(null);

    async function confirm() {
        setState("busy");
        setError(null);
        try {
            await verifyDestination(url, token);
            setState("done");
        } catch (failure) {
            const status = (failure as { response?: Response }).response?.status;
            setError(status === 400 ? t("errors.link_invalid") : errorMessage(failure));
            setState("idle");
        }
    }

    return (
        <VStack gap={3}>
            <Heading level={2}>{t("verify_destination.title")}</Heading>
            {state === "done" ? (
                <>
                    <Banner status="success" title={t("verify_destination.success")} />
                    <Button label={t("verify_destination.home")} onClick={onDone} />
                </>
            ) : (
                <>
                    <Text>{t("verify_destination.description")}</Text>
                    {error && <Banner status="error" title={error} />}
                    <Button
                        variant="primary"
                        width="100%"
                        label={t("verify_destination.submit")}
                        isLoading={state === "busy"}
                        clickAction={confirm}
                    />
                </>
            )}
        </VStack>
    );
}

/**
 * Opened from an account's verification email (`/verify-email?token=`).
 * Confirming takes a click, so a link scanner can't verify an account that
 * someone else signed up with this address. Signs in afterwards.
 */
export function VerifyEmailPage({ url, token, onDone }: PageProps) {
    const t = useTranslations("account");
    const errorMessage = useAccountErrorMessage();
    const connect = useConnect();
    const [state, setState] = useState<"idle" | "busy" | "done">("idle");
    const [error, setError] = useState<string | null>(null);

    async function confirm() {
        setState("busy");
        setError(null);
        try {
            await verifyAccountEmail(url, token);
        } catch (failure) {
            setError(errorMessage(failure));
            setState("idle");
            return;
        }
        // Verifying leaves a cookie session; the app works with its token.
        const session = await sessionFromCookie(url).catch(() => null);
        if (session)
            await connect.mutateAsync({ kind: "worker", url, token: session }).catch(() => {});
        setState("done");
    }

    return (
        <VStack gap={3}>
            <Heading level={2}>{t("verify_email.title")}</Heading>
            {state === "done" ? (
                <>
                    <Banner status="success" title={t("verify_email.success")} />
                    <Button label={t("verify_email.home")} onClick={onDone} />
                </>
            ) : (
                <>
                    <Text>{t("verify_email.description")}</Text>
                    {error && <Banner status="error" title={error} />}
                    <Button
                        variant="primary"
                        width="100%"
                        label={t("verify_email.submit")}
                        isLoading={state === "busy"}
                        clickAction={confirm}
                    />
                </>
            )}
        </VStack>
    );
}

/**
 * The shape of extensions' `identity.launchWebAuthFlow` redirects; which
 * extensions may connect, the Worker decides.
 */
const EXTENSION_REDIRECT =
    /^https:\/\/([a-p]{32}\.chromiumapp\.org|[0-9a-f]{40}\.extensions\.allizom\.org)\/[^#]*$/;

export const isExtensionRedirect = (uri: string) => EXTENSION_REDIRECT.test(uri);

/**
 * `/authorize?redirect_uri=`: the extension asks for a session of its own
 * (through `identity.launchWebAuthFlow`), which it gets in the redirect's
 * fragment once the signed-in user allows it.
 */
export function AuthorizePage({
    url,
    apiToken,
    redirectUri,
}: {
    url: string;
    apiToken: string;
    redirectUri: string;
}) {
    const t = useTranslations("account");
    const errorMessage = useAccountErrorMessage();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const account = useQuery({
        queryKey: ["authorize-account", url, apiToken],
        queryFn: () => new WorkerBackend(url, apiToken).management.getAccount(),
        networkMode: "online",
    });

    const finish = (fragment: string) => window.location.replace(`${redirectUri}#${fragment}`);

    async function allow() {
        setBusy(true);
        setError(null);
        try {
            const token = await createAppSession(url, apiToken, redirectUri);
            finish(`token=${encodeURIComponent(token)}`);
        } catch (failure) {
            const unknownApp = isHTTPError(failure) && failure.response.status === 400;
            setError(unknownApp ? t("authorize.unknown_app") : errorMessage(failure));
            setBusy(false);
        }
    }

    if (account.isPending) return <Spinner />;
    const email = account.data?.user?.email;

    return (
        <VStack gap={3}>
            <Heading level={2}>{t("authorize.title")}</Heading>
            {error && <Banner status="error" title={error} />}
            {account.isError && <Banner status="error" title={errorMessage(account.error)} />}
            {email ? (
                <>
                    <Text>{t("authorize.description", { email })}</Text>
                    <Button
                        variant="primary"
                        width="100%"
                        label={t("authorize.allow")}
                        isLoading={busy}
                        clickAction={allow}
                    />
                </>
            ) : (
                account.isSuccess && <Banner status="info" title={t("authorize.admin_token")} />
            )}
            <Button
                width="100%"
                label={t("authorize.deny")}
                isDisabled={busy}
                onClick={() => finish("error=access_denied")}
            />
        </VStack>
    );
}
