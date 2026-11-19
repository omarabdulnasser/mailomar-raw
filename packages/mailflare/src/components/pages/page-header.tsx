import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import type { ReactNode } from "react";

export function PageHeader({ title, description }: { title: string; description?: ReactNode }) {
    return (
        <VStack gap={1}>
            <Heading level={2}>{title}</Heading>
            {description && <Text type="supporting">{description}</Text>}
        </VStack>
    );
}

/** A page's content column; management pages don't need the full width. */
export function PageBody({ children }: { children: ReactNode }) {
    return (
        <VStack gap={4} style={{ maxWidth: 640, width: "100%" }}>
            {children}
        </VStack>
    );
}
