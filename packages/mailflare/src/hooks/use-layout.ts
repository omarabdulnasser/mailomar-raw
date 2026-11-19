import { useMediaQuery } from "@astryxdesign/core/hooks";

import { useCloudflareConfig } from "../api/config-context";

/**
 * The app's layout for the current screen: `wide` has a sidebar, and from
 * `hasDetailPane` widths a pane for the selected alias; `narrow` (phones and
 * the extension popup) has bottom tabs.
 */
export function useLayout() {
    const { isExtension } = useCloudflareConfig();
    const wide = useMediaQuery("(min-width: 1024px)");
    const veryWide = useMediaQuery("(min-width: 1280px)");
    const isWide = wide && !isExtension;
    return { isWide, hasDetailPane: isWide && veryWide };
}
