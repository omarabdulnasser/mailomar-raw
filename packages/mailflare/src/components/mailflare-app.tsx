import { Banner } from "@astryxdesign/core/Banner";
import { Spinner } from "@astryxdesign/core/Spinner";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useEffect, useState } from "react";
import { useTranslations } from "use-intl";
import { Redirect, Route, Router, Switch, useLocation, useSearch } from "wouter";
import { useHashLocation } from "wouter/use-hash-location";

import { sessionFromCookie } from "../account/account-client";
import { useAccountErrorMessage } from "../account/use-account-error";
import { useCloudflareConfig } from "../api/config-context";
import { useAuthStore } from "../stores/auth-store";
import { AccountLogin } from "./account-login";
import {
    AuthorizePage,
    isExtensionRedirect,
    ResetPasswordPage,
    VerifyDestinationPage,
    VerifyEmailPage,
} from "./account-pages";
import { AppFrame } from "./app-frame";
import { AppLayout } from "./app-layout";
import { useUpdateNotice } from "./extension-notices";
import { Login, useConnect } from "./login";
import { PATHS } from "./navigation";
import { AccountPage } from "./pages/account-page";
import { AdminAccountsPage } from "./pages/admin-accounts-page";
import { AdminDomainsPage } from "./pages/admin-domains-page";
import { AliasesPage } from "./pages/aliases-page";
import { ImportPage } from "./pages/import-page";
import { InboxesPage } from "./pages/inboxes-page";
import { SettingsPage } from "./pages/settings-page";

/**
 * The app a Worker serves itself signs in with the cookie session an email
 * link (verification, magic link) left: on start, and when the window gets
 * focus again (a magic link opened in another tab). Errors from such links
 * arrive as `?error=`.
 */
function useWorkerSession(url: string | undefined) {
    const apiToken = useAuthStore((s) => s.apiToken);
    const toast = useToast();
    const errorMessage = useAccountErrorMessage();
    const connect = useConnect();
    const [, navigate] = useLocation();
    const [checking, setChecking] = useState(!!url && !apiToken);

    useEffect(() => {
        if (!url) return;
        const error = new URLSearchParams(window.location.search).get("error");
        if (!error) return;
        toast({ body: errorMessage({ code: error }), type: "error" });
        navigate("/", { replace: true });
        // Only for the error the page was opened with.
    }, []);

    useEffect(() => {
        if (!url || apiToken) return;
        let cancelled = false;
        const check = () =>
            sessionFromCookie(url)
                .then((token) =>
                    token && !cancelled
                        ? connect.mutateAsync({ kind: "worker", url, token })
                        : null,
                )
                .catch(() => {})
                .finally(() => !cancelled && setChecking(false));
        void check();
        window.addEventListener("focus", check);
        return () => {
            cancelled = true;
            window.removeEventListener("focus", check);
        };
    }, [url, apiToken]);

    return { checking };
}

/** Pages the Worker's emails link to; they work signed in or not. */
function LinkPage({ url, Page }: { url: string; Page: typeof ResetPasswordPage }) {
    const token = new URLSearchParams(useSearch()).get("token");
    const [, navigate] = useLocation();
    if (!token) return <Redirect to="/" replace />;
    return (
        <AppLayout>
            <Page url={url} token={token} onDone={() => navigate("/", { replace: true })} />
        </AppLayout>
    );
}

/** `/authorize`: the extension asks to connect (see AuthorizePage). */
function AuthorizeRoute({ url, checking }: { url: string; checking: boolean }) {
    const t = useTranslations("account");
    const apiToken = useAuthStore((s) => s.apiToken);
    const redirectUri = new URLSearchParams(useSearch()).get("redirect_uri") ?? "";

    let content;
    if (!isExtensionRedirect(redirectUri)) {
        content = <Banner status="error" title={t("authorize.invalid")} />;
    } else if (apiToken) {
        content = <AuthorizePage url={url} apiToken={apiToken} redirectUri={redirectUri} />;
    } else if (checking) {
        content = <Spinner />;
    } else {
        content = (
            <VStack gap={3}>
                <Banner status="info" title={t("authorize.sign_in_first")} />
                <AccountLogin url={url} />
            </VStack>
        );
    }
    return <AppLayout>{content}</AppLayout>;
}

function AppRoutes() {
    const { lockedWorkerUrl: url } = useCloudflareConfig();
    const apiToken = useAuthStore((s) => s.apiToken);
    const [location] = useLocation();
    const { checking } = useWorkerSession(url);
    useUpdateNotice();

    if (url) {
        if (location === "/reset-password") return <LinkPage url={url} Page={ResetPasswordPage} />;
        if (location === "/verify-email") return <LinkPage url={url} Page={VerifyEmailPage} />;
        if (location === "/verify-destination") {
            return <LinkPage url={url} Page={VerifyDestinationPage} />;
        }
        if (location === "/authorize") return <AuthorizeRoute url={url} checking={checking} />;
    }

    if (!apiToken) {
        return (
            <AppLayout>
                {checking ? <Spinner /> : url ? <AccountLogin url={url} /> : <Login />}
            </AppLayout>
        );
    }

    // Management pages only exist in the Worker's own app.
    const workerPages = url
        ? [
              <Route key="inboxes" path={PATHS.inboxes} component={InboxesPage} />,
              <Route key="account" path={PATHS.account} component={AccountPage} />,
              <Route key="domains" path={PATHS.adminDomains} component={AdminDomainsPage} />,
              <Route key="accounts" path={PATHS.adminAccounts} component={AdminAccountsPage} />,
          ]
        : [];

    return (
        <AppFrame>
            <Switch>
                <Route path={PATHS.aliases} component={AliasesPage} />
                <Route path={PATHS.settings} component={SettingsPage} />
                <Route path={PATHS.import} component={ImportPage} />
                {workerPages}
                <Route>
                    <Redirect to={PATHS.aliases} replace />
                </Route>
            </Switch>
        </AppFrame>
    );
}

export function MailflareApp() {
    const { isExtension } = useCloudflareConfig();
    // The extension popup has no paths of its own; it routes in the hash.
    return (
        <Router {...(isExtension && { hook: useHashLocation })}>
            <AppRoutes />
        </Router>
    );
}
