/// <reference path="./css.d.ts" />
// Global styles for every Mailflare surface (popup, import page, web app, landing page).
// Order matters: reset → component base styles → fonts → theme tokens.
import "@astryxdesign/core/reset.css";
import "@astryxdesign/core/astryx.css";
// Figtree is the neutral theme's font. Self-hosted instead of the theme's
// fonts.css, which loads it from Google Fonts (privacy + offline support).
import "@fontsource/figtree/400.css";
import "@fontsource/figtree/500.css";
import "@fontsource/figtree/600.css";
import "@fontsource/figtree/700.css";

// Imports the built Mailflare theme CSS as a side effect.
export { themes, defaultThemeSlug } from "./astryx-themes";
