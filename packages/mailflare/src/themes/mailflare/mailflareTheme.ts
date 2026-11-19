import { defineTheme } from "@astryxdesign/core/theme";
import { neutralTheme } from "@astryxdesign/theme-neutral";

/**
 * Mailflare brand theme: Astryx neutral with the Mailflare orange as accent.
 *
 * This is the authoring source. Apps consume the built output
 * (`astryx theme build`), never this file directly.
 */
export const mailflareTheme = defineTheme({
    name: "mailflare",
    extends: neutralTheme,
    tokens: {
        //                 light      dark
        "--color-accent": ["#e8590c", "#fd7e14"],
    },
});
