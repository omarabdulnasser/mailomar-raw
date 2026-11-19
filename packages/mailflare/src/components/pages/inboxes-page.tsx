// Worker app: the mailboxes the caller's aliases forward to.

import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { useTranslations } from "use-intl";

import { useMailflare } from "../../backend/use-mailflare";
import { useOnlineStatus } from "../../hooks/use-online-status";
import { type Item, ManagedList } from "../managed-list";
import { PageBody, PageHeader } from "./page-header";

export function InboxesPage() {
    const t = useTranslations("manage_domains");
    const tn = useTranslations("nav");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const { account, destinations, addDestination, removeDestination, resendConfirmation } =
        useMailflare();
    const onError = (error: Error) => toast({ body: error.message, type: "error" });
    // Accounts confirm new mailboxes by email; the admin token's are trusted.
    const isAccount = !!account.data?.user;
    const limits = account.data?.limits;

    const items: Item[] = (destinations.data ?? []).map((destination) => ({
        id: destination.id,
        label: destination.email,
        extra: !destination.verified && (
            <>
                <Badge variant="warning" label={t("unconfirmed")} />
                <Button
                    size="sm"
                    variant="ghost"
                    label={t("resend")}
                    isDisabled={!isOnline}
                    isLoading={
                        resendConfirmation.isPending &&
                        resendConfirmation.variables === destination.id
                    }
                    onClick={() =>
                        resendConfirmation.mutate(destination.id, {
                            onSuccess: () =>
                                toast({ body: t("resent", { email: destination.email }) }),
                            onError,
                        })
                    }
                />
            </>
        ),
    }));

    return (
        <PageBody>
            <PageHeader
                title={tn("inboxes")}
                description={
                    isAccount
                        ? t("destinations_description_account")
                        : t("destinations_description")
                }
            />
            <ManagedList
                title={t("destinations")}
                isTitleHidden
                description=""
                items={items}
                inputLabel={t("destination_input")}
                placeholder="you@example.org"
                inputType="email"
                add={addDestination}
                remove={removeDestination}
            />
            {limits && (
                <Text type="supporting">
                    {t("limits", {
                        aliases: limits.aliases,
                        destinations: limits.destinations,
                        sends: limits.sendsPerDay,
                    })}
                </Text>
            )}
        </PageBody>
    );
}
