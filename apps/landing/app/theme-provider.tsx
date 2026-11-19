"use client";

import { Theme } from "@astryxdesign/core/theme";
import { defaultThemeSlug, themes } from "@mailflare/core/styles";
import type { ReactNode } from "react";

// Astryx's Theme reads React context, so it has to live in a client component.
// It also pulls in the global Astryx/Mailflare stylesheets via @mailflare/core/styles.
// The page itself stays a server component and is rendered to static HTML.
export function ThemeProvider({ children }: { children: ReactNode }) {
    return (
        <Theme theme={themes[defaultThemeSlug]} mode="system">
            {children}
        </Theme>
    );
}
