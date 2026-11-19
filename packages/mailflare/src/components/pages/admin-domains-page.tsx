// Worker app, admins: the Worker's domains, and which accounts may use.

import { Switch } from "@astryxdesign/core/Switch";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useTranslations } from "use-intl";

import { useMailflare } from "../../backend/use-mailflare";
import { useOnlineStatus } from "../../hooks/use-online-status";
import { type Item, ManagedList } from "../managed-list";
import { PageBody, PageHeader } from "./page-header";

export function AdminDomainsPage() {
    const t = useTranslations("manage_domains");
    const tn = useTranslations("nav");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const { zones, addDomain, removeDomain, setDomainShared } = useMailflare();
    const onError = (error: Error) => toast({ body: error.message, type: "error" });

    const items: Item[] = (zones.data ?? []).map((zone) => ({
        id: zone.id,
        label: zone.name,
        extra: (
            <>
                <Text type="supporting">{t("shared")}</Text>
                <Switch
                    label={t("shared_label", { domain: zone.name })}
                    isLabelHidden
                    value={zone.shared ?? false}
                    isDisabled={!isOnline || setDomainShared.isPending}
                    onChange={(shared) =>
                        setDomainShared.mutate({ zoneId: zone.id, shared }, { onError })
                    }
                />
            </>
        ),
    }));

    return (
        <PageBody>
            <PageHeader
                title={tn("domains")}
                description={
                    <>
                        {t("domains_description")} {t("shared_hint")}
                    </>
                }
            />
            <ManagedList
                title={t("domains")}
                isTitleHidden
                description=""
                items={items}
                inputLabel={t("domain_input")}
                placeholder="example.com"
                inputType="text"
                add={addDomain}
                remove={removeDomain}
            />
        </PageBody>
    );
}
