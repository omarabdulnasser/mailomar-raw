import { Button } from "@astryxdesign/core/Button";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useQueryClient } from "@tanstack/react-query";
import { Fragment, type ReactNode, useState } from "react";
import { LuExternalLink, LuImport } from "react-icons/lu";
import { useTranslations } from "use-intl";
import { useLocation } from "wouter";

import { useCloudflareConfig } from "../../api/config-context";
import { useMailflare } from "../../backend/use-mailflare";
import { GITHUB_LINK } from "../../const";
import { useLayout } from "../../hooks/use-layout";
import { useAuthStore } from "../../stores/auth-store";
import { type Settings, useSettingsStore } from "../../stores/settings-store";
import { LogoutDialog } from "../logout-dialog";
import { PATHS } from "../navigation";
import { PageBody, PageHeader } from "./page-header";

type SettingsItem = {
    key: string;
    title: string;
    description?: string;
    action: ReactNode;
    hide?: boolean;
};

export function SettingsPage() {
    const queryClient = useQueryClient();
    const t = useTranslations("settings");
    const tc = useTranslations("common");
    const toast = useToast();
    const { isExtension, lockedWorkerUrl } = useCloudflareConfig();
    const tn = useTranslations("nav");
    const { backend, zones, destinations, canEditDomains } = useMailflare();
    const workerUrl = useAuthStore((s) => s.workerUrl);
    const { isWide } = useLayout();
    const [, navigate] = useLocation();

    const apiToken = useAuthStore((s) => s.apiToken);
    const settings = useSettingsStore();
    const updateSettings = useSettingsStore((s) => s.updateSettings);

    const [logoutOpen, setLogoutOpen] = useState(false);

    function toggle(key: "ruleFilter" | "copyAlias" | "showCreateButton", title: string) {
        return (
            <Switch
                label={title}
                isLabelHidden
                value={settings[key]}
                onChange={(checked) => updateSettings({ [key]: checked })}
            />
        );
    }

    const settingsItems: SettingsItem[] = [
        {
            key: "theme",
            title: t("theme.title"),
            description: t("theme.description"),
            action: (
                <Selector
                    label={t("theme.title")}
                    isLabelHidden
                    size="sm"
                    width={120}
                    value={settings.theme}
                    onChange={(value) => updateSettings({ theme: value as Settings["theme"] })}
                    options={[
                        { value: "light", label: t("theme.light") },
                        { value: "dark", label: t("theme.dark") },
                        { value: "system", label: t("theme.auto") },
                    ]}
                />
            ),
        },
        {
            key: "locale",
            title: t("language.title"),
            description: t("language.description"),
            action: (
                <Selector
                    label={t("language.title")}
                    isLabelHidden
                    size="sm"
                    width={120}
                    value="en"
                    onChange={() => {}}
                    options={[{ value: "en", label: t("language.english") }]}
                />
            ),
        },
        {
            key: "filter",
            title: t("filter.title"),
            description: t("filter.description"),
            // Only Cloudflare has rules created outside Mailflare.
            hide: !apiToken || backend?.kind !== "cloudflare",
            action: toggle("ruleFilter", t("filter.title")),
        },
        {
            key: "copy",
            title: t("copy.title"),
            description: t("copy.description"),
            hide: !apiToken,
            action: toggle("copyAlias", t("copy.title")),
        },
        {
            key: "create-button",
            title: t("quick_create.title"),
            description: t("quick_create.description"),
            hide: !apiToken || !isExtension,
            action: toggle("showCreateButton", t("quick_create.title")),
        },
        {
            key: "worker",
            title: t("worker.title"),
            description: t("worker.description"),
            // Outside the Worker's own app, management happens there.
            hide: !workerUrl || !!lockedWorkerUrl,
            action: (
                <Button
                    size="sm"
                    variant="ghost"
                    label={t("worker.action")}
                    endContent={<LuExternalLink />}
                    href={workerUrl ?? undefined}
                    target="_blank"
                />
            ),
        },
        {
            key: "admin",
            title: t("admin.title"),
            description: t("admin.description"),
            // The sidebar has these on wide screens.
            hide: !lockedWorkerUrl || !canEditDomains || isWide,
            action: (
                <HStack gap={1}>
                    <Button
                        size="sm"
                        label={tn("domains")}
                        onClick={() => navigate(PATHS.adminDomains)}
                    />
                    <Button
                        size="sm"
                        label={tn("accounts")}
                        onClick={() => navigate(PATHS.adminAccounts)}
                    />
                </HStack>
            ),
        },
        {
            key: "refresh",
            title: t("refresh.title"),
            description: t("refresh.description"),
            hide: !apiToken,
            action: (
                <Button
                    size="sm"
                    label={t("refresh.action")}
                    isLoading={zones.isFetching || destinations.isFetching}
                    clickAction={async () => {
                        await queryClient.invalidateQueries();
                        toast({ body: t("refresh.success") });
                    }}
                />
            ),
        },
        {
            key: "logout",
            title: t("logout.title"),
            description: t("logout.description"),
            hide: !apiToken,
            action: (
                <Button
                    size="sm"
                    variant="destructive"
                    label={t("logout.action")}
                    onClick={() => setLogoutOpen(true)}
                />
            ),
        },
        {
            key: "import",
            title: t("import.title"),
            description: t("import.description"),
            hide: !apiToken,
            action: (
                <Button
                    size="sm"
                    label={t("import.action")}
                    icon={<LuImport />}
                    onClick={() => {
                        // The popup is too small, and closes when it loses focus.
                        if (isExtension) {
                            window.open(
                                (globalThis as any).chrome.runtime.getURL("/import.html"),
                                "_blank",
                            );
                        } else {
                            navigate(PATHS.import);
                        }
                    }}
                />
            ),
        },
        {
            key: "docs-link",
            title: t("docs.title"),
            description: t("docs.description"),
            action: (
                <Button
                    size="sm"
                    variant="ghost"
                    label={tc("open")}
                    endContent={<LuExternalLink />}
                    href="https://developers.cloudflare.com/email-routing/"
                    target="_blank"
                />
            ),
        },
        {
            key: "info",
            title: t("info"),
            description: "MailFlare v2",
            action: (
                <Button
                    size="sm"
                    variant="ghost"
                    label="GitHub"
                    endContent={<LuExternalLink />}
                    href={GITHUB_LINK}
                    target="_blank"
                />
            ),
        },
    ];

    const visibleItems = settingsItems.filter((item) => !item.hide);

    return (
        <PageBody>
            <PageHeader title={t("title")} />
            <VStack gap={2}>
                {visibleItems.map((item, index) => (
                    <Fragment key={item.key}>
                        <HStack justify="between" align="center" gap={3}>
                            <VStack gap={0.5} style={{ flex: 1, minWidth: 0 }}>
                                <Text weight="medium">{item.title}</Text>
                                {item.description && (
                                    <Text type="supporting">{item.description}</Text>
                                )}
                            </VStack>
                            {item.action}
                        </HStack>
                        {index < visibleItems.length - 1 && <Divider />}
                    </Fragment>
                ))}
                <LogoutDialog
                    open={logoutOpen}
                    onClose={() => setLogoutOpen(false)}
                    onLoggedOut={() => navigate(PATHS.aliases)}
                />
            </VStack>
        </PageBody>
    );
}
