import type { Metadata } from "next";
import type { ReactNode } from "react";

import { ThemeProvider } from "./theme-provider";

export const metadata: Metadata = {
    title: "MailFlare - Email Aliases with Cloudflare Email Routing",
    description:
        "Your own email alias service on Cloudflare: a browser extension and web app for Email Routing, with an optional Worker for unlimited aliases and replies.",
    icons: { icon: "/favicon.svg" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="en">
            <body style={{ margin: 0 }}>
                <ThemeProvider>{children}</ThemeProvider>
            </body>
        </html>
    );
}
