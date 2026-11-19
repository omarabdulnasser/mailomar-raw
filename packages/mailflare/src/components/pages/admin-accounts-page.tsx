// Worker app, admins: the accounts on the Worker, with promoting to admin and
// suspending (which signs the account out everywhere).

import { Badge } from "@astryxdesign/core/Badge";
import { Banner } from "@astryxdesign/core/Banner";
import { HStack } from "@astryxdesign/core/HStack";
import { MoreMenu } from "@astryxdesign/core/MoreMenu";
import { Spinner } from "@astryxdesign/core/Spinner";
import { Text } from "@astryxdesign/core/Text";
import { useToast } from "@astryxdesign/core/Toast";
import { VStack } from "@astryxdesign/core/VStack";
import { useTranslations } from "use-intl";

import type { AccountUser, AccountUserChanges } from "../../backend/types";
import { useAccountUsers, useMailflare } from "../../backend/use-mailflare";
import { useOnlineStatus } from "../../hooks/use-online-status";
import { PageBody, PageHeader } from "./page-header";

export function AdminAccountsPage() {
    const t = useTranslations("users");
    const toast = useToast();
    const { isOnline } = useOnlineStatus();
    const { account } = useMailflare();
    const { users, updateUser } = useAccountUsers(true);
    const selfId = account.data?.user?.id;

    const change = (user: AccountUser, changes: AccountUserChanges) =>
        updateUser.mutate(
            { id: user.id, changes },
            { onError: (error) => toast({ body: error.message, type: "error" }) },
        );

    return (
        <PageBody>
            <PageHeader title={t("title")} description={t("description")} />
            <VStack gap={2}>
                {users.isPending && <Spinner />}
                {users.isError && (
                    <Banner status="error" title={t("error", { error: users.error.message })} />
                )}
                {users.data?.length === 0 && <Text type="supporting">{t("empty")}</Text>}
                {users.data?.map((user) => (
                    <HStack key={user.id} gap={2} align="center">
                        <Text maxLines={1} style={{ flex: 1, minWidth: 0 }}>
                            {user.email}
                        </Text>
                        {user.id === selfId && <Badge label={t("you")} />}
                        {user.role === "admin" && <Badge variant="info" label={t("admin")} />}
                        {user.banned && <Badge variant="error" label={t("suspended")} />}
                        {!user.emailVerified && <Badge variant="warning" label={t("unverified")} />}
                        {user.id !== selfId && (
                            <MoreMenu
                                label={user.email}
                                isDisabled={!isOnline || updateUser.isPending}
                                items={[
                                    user.role === "admin"
                                        ? {
                                              label: t("remove_admin"),
                                              onClick: () => change(user, { role: "user" }),
                                          }
                                        : {
                                              label: t("make_admin"),
                                              onClick: () => change(user, { role: "admin" }),
                                          },
                                    user.banned
                                        ? {
                                              label: t("unsuspend"),
                                              onClick: () => change(user, { banned: false }),
                                          }
                                        : {
                                              label: t("suspend"),
                                              onClick: () => change(user, { banned: true }),
                                          },
                                ]}
                            />
                        )}
                    </HStack>
                ))}
            </VStack>
        </PageBody>
    );
}
