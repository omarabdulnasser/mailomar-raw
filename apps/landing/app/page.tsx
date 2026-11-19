import { Button } from "@astryxdesign/core/Button";
import { Card } from "@astryxdesign/core/Card";
import { Grid } from "@astryxdesign/core/Grid";
import { Heading } from "@astryxdesign/core/Heading";
import { HStack } from "@astryxdesign/core/HStack";
import { Link } from "@astryxdesign/core/Link";
import { Section } from "@astryxdesign/core/Section";
import { Text } from "@astryxdesign/core/Text";
import { VStack } from "@astryxdesign/core/VStack";
import { CHROME_DOWNLOAD_LINK, FIREFOX_DOWNLOAD_LINK, GITHUB_LINK } from "@mailflare/core/const";
import type { ReactNode } from "react";
import {
    TbBrandChrome,
    TbBrandCloudflare,
    TbBrandFirefox,
    TbBrandGithub,
    TbCheck,
    TbClick,
    TbCode,
    TbEdit,
    TbFileImport,
    TbPuzzle,
    TbSparkles,
} from "react-icons/tb";

const WEB_APP_LINK = "https://app.mailflare.cc";
const DOCS_LINK = `${GITHUB_LINK}/tree/main/docs`;
const WORKER_GUIDE_LINK = `${GITHUB_LINK}/blob/main/docs/guides/worker-mode.md`;
const DEPLOY_LINK = `https://deploy.workers.cloudflare.com/?url=${GITHUB_LINK}`;

const FEATURES: { icon: ReactNode; title: string; description: string }[] = [
    {
        icon: <TbPuzzle />,
        title: "Extension and Web App",
        description:
            "For Chrome, Edge, Firefox and other browsers, or as a web app you can install on any device.",
    },
    {
        icon: <TbSparkles />,
        title: "Generate Aliases",
        description:
            "Random characters or words, the website's name as a prefix, or your own address. Your preferences are remembered.",
    },
    {
        icon: <TbClick />,
        title: "Right Where You Need It",
        description:
            "Right-click any page, or use the button inside email fields, to create and copy an alias for that site.",
    },
    {
        icon: <TbEdit />,
        title: "Search, Edit, Bulk Actions",
        description:
            "Find aliases by address or note, change destinations, turn aliases off, and edit or delete many at once.",
    },
    {
        icon: <TbFileImport />,
        title: "Import",
        description: "Bring your aliases over from addy.io and SimpleLogin.",
    },
    {
        icon: <TbCode />,
        title: "Open Source",
        description:
            "MIT licensed. Everything runs on your own Cloudflare account; MailFlare has no servers of its own.",
    },
];

const MODES: {
    title: string;
    description: string;
    points: string[];
    note?: string;
    actions: ReactNode;
}[] = [
    {
        title: "Email Routing rules",
        description: "Paste a Cloudflare API token and start. Nothing to deploy.",
        points: [
            "Each alias is an Email Routing rule in your account",
            "Up to 200 aliases per domain",
            "Works next to the rules you already have",
        ],
        actions: (
            <HStack>
                <Button label="Open Web App" href={WEB_APP_LINK} target="_blank" />
            </HStack>
        ),
    },
    {
        title: "Mailflare Worker",
        description:
            "Deploy a Worker to your Cloudflare account that receives your domains' mail. Free within the Workers Free plan.",
        points: [
            "No limit on aliases",
            "Reply from your aliases, without revealing your address",
            "See what each alias forwarded and blocked",
            "Accounts for family and friends on domains you share, with passkeys",
            "Comes with its own copy of the web app",
        ],
        note: "Replies and accounts need Cloudflare Email Sending (Workers Paid plan).",
        actions: (
            <HStack gap={3} wrap="wrap">
                <Button
                    variant="primary"
                    label="Deploy to Cloudflare"
                    icon={<TbBrandCloudflare />}
                    href={DEPLOY_LINK}
                    target="_blank"
                />
                <Button
                    variant="ghost"
                    label="Read the guide"
                    href={WORKER_GUIDE_LINK}
                    target="_blank"
                />
            </HStack>
        ),
    },
];

const CONTENT_WIDTH = 960;

export default function HomePage() {
    return (
        <VStack as="main" minHeight="100vh">
            {/* Hero */}
            <VStack
                as="header"
                gap={8}
                align="center"
                paddingInline={4}
                paddingBlock={10}
                maxWidth={760}
                style={{
                    marginInline: "auto",
                    paddingBlockStart: "clamp(4rem, 12vw, 8rem)",
                    paddingBlockEnd: "clamp(2rem, 6vw, 4rem)",
                }}
            >
                <img src="/icon.png" alt="" width={72} height={72} />
                <VStack gap={5}>
                    <Heading level={1} type="display-1" justify="center" textWrap="balance">
                        Create email <span style={accent}>aliases</span> with{" "}
                        <span style={accent}>Cloudflare</span> Email Routing
                    </Heading>
                    <Text type="large" color="secondary" justify="center" textWrap="pretty">
                        MailFlare is a browser extension and web app that turns Cloudflare Email
                        Routing into your own private email alias service, similar to addy.io or
                        SimpleLogin. No third-party service and no mail server of your own: just
                        your Cloudflare account.
                    </Text>
                </VStack>
                <HStack gap={3} justify="center" wrap="wrap">
                    <Button variant="primary" size="lg" label="Download" href="#downloads" />
                    <Button size="lg" label="Open Web App" href={WEB_APP_LINK} target="_blank" />
                    <Button
                        variant="ghost"
                        size="lg"
                        label="GitHub"
                        icon={<TbBrandGithub />}
                        href={GITHUB_LINK}
                        target="_blank"
                    />
                </HStack>
            </VStack>

            {/* Features */}
            <VStack
                as="section"
                gap={8}
                paddingInline={4}
                paddingBlock={10}
                maxWidth={CONTENT_WIDTH}
                width="100%"
                style={{ marginInline: "auto", boxSizing: "border-box" }}
            >
                <Heading level={2} type="display-3" justify="center">
                    Features
                </Heading>
                <Grid columns={{ minWidth: 260, max: 3 }} gap={4}>
                    {FEATURES.map((f) => (
                        <Card key={f.title} padding={5}>
                            <VStack gap={2}>
                                <span style={featureIcon}>{f.icon}</span>
                                <Heading level={3}>{f.title}</Heading>
                                <Text color="secondary">{f.description}</Text>
                            </VStack>
                        </Card>
                    ))}
                </Grid>
            </VStack>

            {/* Modes */}
            <VStack
                as="section"
                gap={8}
                paddingInline={4}
                paddingBlock={10}
                maxWidth={CONTENT_WIDTH}
                width="100%"
                style={{ marginInline: "auto", boxSizing: "border-box" }}
            >
                <VStack gap={3}>
                    <Heading level={2} type="display-3" justify="center">
                        Two ways to keep your aliases
                    </Heading>
                    <Text type="large" color="secondary" justify="center" textWrap="pretty">
                        Both work with the same extension and web app. Start with rules and add the
                        Worker whenever you like: your existing rules keep working.
                    </Text>
                </VStack>
                <Grid columns={{ minWidth: 320, max: 2 }} gap={4}>
                    {MODES.map((mode) => (
                        <Card key={mode.title} padding={6}>
                            <VStack gap={4} height="100%">
                                <VStack gap={2}>
                                    <Heading level={3}>{mode.title}</Heading>
                                    <Text color="secondary">{mode.description}</Text>
                                </VStack>
                                <ul style={checklist}>
                                    {mode.points.map((point) => (
                                        <li key={point} style={checklistItem}>
                                            <span style={checkIcon}>
                                                <TbCheck />
                                            </span>
                                            <Text>{point}</Text>
                                        </li>
                                    ))}
                                </ul>
                                {mode.note && (
                                    <Text type="supporting" color="secondary">
                                        {mode.note}
                                    </Text>
                                )}
                                {mode.actions}
                            </VStack>
                        </Card>
                    ))}
                </Grid>
            </VStack>

            {/* Downloads */}
            <Section variant="muted" dividers={["top", "bottom"]} paddingBlock={10}>
                <div id="downloads" style={{ scrollMarginTop: 32 }}>
                    <HStack
                        gap={10}
                        align="center"
                        wrap="wrap"
                        justify="center"
                        maxWidth={CONTENT_WIDTH}
                        style={{ marginInline: "auto" }}
                    >
                        <VStack gap={3} style={{ flex: "1 1 360px" }}>
                            <Heading level={2} type="display-3">
                                Extension Downloads
                            </Heading>
                            <Text type="large" color="secondary">
                                Install the extension from the Chrome Web Store for Chromium-based
                                browsers (Chrome, Brave, Edge, Opera), or from Firefox Add-ons.
                            </Text>
                        </VStack>
                        <VStack gap={3} style={{ flex: "0 1 240px" }}>
                            <Button
                                variant="primary"
                                size="lg"
                                width="100%"
                                label="Chrome Web Store"
                                icon={<TbBrandChrome />}
                                href={CHROME_DOWNLOAD_LINK}
                                target="_blank"
                            />
                            <Button
                                size="lg"
                                width="100%"
                                label="Firefox"
                                icon={<TbBrandFirefox />}
                                href={FIREFOX_DOWNLOAD_LINK}
                                target="_blank"
                            />
                        </VStack>
                    </HStack>
                </div>
            </Section>

            {/* Footer */}
            <HStack
                as="footer"
                justify="between"
                align="center"
                wrap="wrap"
                gap={4}
                paddingInline={4}
                paddingBlock={8}
                maxWidth={CONTENT_WIDTH}
                width="100%"
                style={{ marginInline: "auto", boxSizing: "border-box" }}
            >
                <Text color="secondary">© Curetix {new Date().getFullYear()}</Text>
                <HStack gap={6}>
                    <Link href={WEB_APP_LINK} color="secondary">
                        Web App
                    </Link>
                    <Link href={DOCS_LINK} color="secondary">
                        Docs
                    </Link>
                    <Link href={GITHUB_LINK} color="secondary">
                        GitHub
                    </Link>
                </HStack>
            </HStack>
        </VStack>
    );
}

const accent = { color: "var(--color-accent)" } as const;

const featureIcon = {
    display: "inline-flex",
    fontSize: 28,
    color: "var(--color-accent)",
} as const;

const checklist = {
    listStyle: "none",
    margin: 0,
    padding: 0,
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
} as const;

const checklistItem = { display: "flex", gap: 8, alignItems: "flex-start" } as const;

const checkIcon = {
    display: "inline-flex",
    flexShrink: 0,
    marginBlockStart: 3,
    color: "var(--color-accent)",
} as const;
