// The alias list; on very wide screens with the selected alias beside it.

import { Card } from "@astryxdesign/core/Card";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { useState } from "react";
import { useTranslations } from "use-intl";

import { useMailflare } from "../../backend/use-mailflare";
import { useLayout } from "../../hooks/use-layout";
import { useUIStore } from "../../stores/ui-store";
import { AliasDetails } from "../alias-details";
import { AliasList } from "../alias-list";

const PANE_WIDTH = 380;

export function AliasesPage() {
    const t = useTranslations("alias_details");
    const { isWide, hasDetailPane } = useLayout();
    const { aliases } = useMailflare();
    const setAliasToDeleteId = useUIStore((s) => s.setAliasToDeleteId);
    const setDeleteOpen = useUIStore((s) => s.setDeleteOpen);
    const [openId, setOpenId] = useState<string | null>(null);

    if (!hasDetailPane) return <AliasList hideDomainSelector={isWide} />;

    const open = aliases.data?.find((alias) => alias.id === openId) ?? null;

    return (
        <HStack gap={4} align="start">
            <div style={{ flex: 1, minWidth: 0 }}>
                <AliasList
                    hideDomainSelector
                    onOpenAlias={(alias) => setOpenId(alias.id)}
                    openAliasId={open?.id ?? null}
                />
            </div>
            <div style={{ width: PANE_WIDTH, flexShrink: 0, position: "sticky", top: 0 }}>
                <Card padding={4}>
                    {open ? (
                        <AliasDetails
                            key={open.id}
                            alias={open}
                            onClose={() => setOpenId(null)}
                            onDelete={() => {
                                setAliasToDeleteId(open.id);
                                setDeleteOpen(true);
                            }}
                        />
                    ) : (
                        <Text type="supporting">{t("empty")}</Text>
                    )}
                </Card>
            </div>
        </HStack>
    );
}
