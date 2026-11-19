import { Card } from "@astryxdesign/core/Card";
import { Divider } from "@astryxdesign/core/Divider";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";
import { useTranslations } from "use-intl";

import { useLayout } from "../hooks/use-layout";
import { CloudflareAccessBanner } from "./extension-notices";
import { OfflineBanner } from "./offline-banner";

/**
 * Sign-in and the pages email links open: a card in the middle of wide
 * screens, the plain column in the extension popup and on phones.
 */
export function AppLayout({ children }: { children: ReactNode }) {
    const t = useTranslations("nav");
    const { isWide } = useLayout();

    if (isWide) {
        return (
            <VStack
                height="100%"
                align="center"
                justify="center"
                gap={4}
                padding={4}
                style={{ overflowY: "auto" }}
            >
                <VStack gap={1} align="center">
                    <Text type="large" weight="bold">
                        MailFlare
                    </Text>
                    <Text type="supporting">{t("tagline")}</Text>
                </VStack>
                <OfflineBanner />
                <CloudflareAccessBanner />
                <Card padding={6} style={{ width: "100%", maxWidth: 440 }}>
                    {children}
                </Card>
            </VStack>
        );
    }

    return (
        <VStack height="100%" maxWidth={600} style={{ marginInline: "auto" }}>
            <HStack justify="between" align="center" paddingInline={3} paddingBlock={2}>
                <Text type="large" weight="bold">
                    MailFlare
                </Text>
            </HStack>
            <Divider />
            <OfflineBanner />
            <CloudflareAccessBanner />
            <VStack padding={2}>{children}</VStack>
        </VStack>
    );
}
