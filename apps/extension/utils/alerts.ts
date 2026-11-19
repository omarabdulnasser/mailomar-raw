// In-page alerts (context menu progress/results, quick-create errors).
//
// Plain DOM + CSS styled after Astryx toasts, rendered in a closed shadow root
// so page styles cannot distort them. Values were measured from the app's
// rendered Astryx toasts (Mailflare theme).

import { colorScheme, type ContentSettings, watchSettings } from "./settings";

export type ContentScriptAlert = {
    id: number;
    type?: "info" | "success" | "error";
    message: string;
    timeout?: number;
    isLoading?: boolean;
};

const STYLES = `
.viewport {
  position: fixed;
  top: 16px;
  inset-inline-end: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(360px, calc(100vw - 32px));
  font: 400 14px/20px Figtree, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    Helvetica, Arial, sans-serif;
}
.toast {
  /* Info toasts are inverted against the page's color scheme, like Astryx. */
  --bg: light-dark(rgb(10 19 23), #ffffff);
  --fg: light-dark(#ffffff, rgb(10 19 23));
  /* light-dark() takes exactly two values, so it switches each layer's color. */
  --shadow: 0 2px 4px light-dark(oklch(0 0 0 / 0.05), oklch(0 0 0 / 0.35)),
    0 4px 12px light-dark(oklch(0 0 0 / 0.1), oklch(0 0 0 / 0.5)),
    inset 0 0 0 1px light-dark(transparent, oklch(1 0 0 / 0.12));
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 12px 12px 16px;
  border-radius: 12px;
  background: var(--bg);
  color: var(--fg);
  box-shadow: var(--shadow);
  animation: enter 200ms cubic-bezier(0.24, 1, 0.4, 1);
}
.toast[data-type="error"] {
  --bg: light-dark(rgb(170 7 30), rgb(227 25 59));
  --fg: #ffffff;
}
.message { flex: 1; min-width: 0; overflow-wrap: anywhere; }
.spinner { flex: none; width: 16px; height: 16px; animation: spin 700ms linear infinite; }
button {
  all: unset;
  flex: none;
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  border-radius: 10px;
  color: inherit;
  cursor: pointer;
  transition: background-color 125ms cubic-bezier(0.24, 1, 0.4, 1);
}
button:hover { background-color: color-mix(in srgb, currentColor 12%, transparent); }
button:focus-visible { outline: 2px solid currentColor; outline-offset: 1px; }
svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round; }
@keyframes enter { from { opacity: 0; transform: translateY(-8px); } }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .toast, .spinner { animation: none; } }
`;

// Tabler icons (MIT).
const SPINNER = '<path d="M12 3a9 9 0 1 0 9 9"/>';
const CLOSE = '<path d="M18 6l-12 12"/><path d="M6 6l12 12"/>';

let settings: ContentSettings = {};
let host: HTMLElement | null = null;
let viewport: HTMLElement | null = null;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const toasts = new Map<number, HTMLElement>();

watchSettings((next) => {
    settings = next;
    if (host) host.style.colorScheme = colorScheme(settings);
});

function getViewport(): HTMLElement {
    if (host && viewport && host.isConnected) return viewport;

    host = document.createElement("mailflare-alerts");
    // Inline styles beat page CSS that targets the host element itself.
    host.style.cssText =
        "all:initial;position:fixed;z-index:2147483647;display:block;margin:0;padding:0;border:0;";
    host.style.colorScheme = colorScheme(settings);
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    viewport = document.createElement("div");
    viewport.className = "viewport";
    shadow.append(style, viewport);
    document.documentElement.append(host);
    return viewport;
}

export function showAlert(alert: ContentScriptAlert) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.dataset.type = alert.type === "error" ? "error" : "info";
    // Errors interrupt screen readers; everything else is announced politely.
    toast.setAttribute("role", alert.type === "error" ? "alert" : "status");

    if (alert.isLoading) {
        toast.insertAdjacentHTML(
            "beforeend",
            `<svg class="spinner" viewBox="0 0 24 24" aria-hidden="true">${SPINNER}</svg>`,
        );
    }

    const message = document.createElement("div");
    message.className = "message";
    message.textContent = alert.message; // Never innerHTML: messages include API errors.
    toast.append(message);

    const close = document.createElement("button");
    close.type = "button";
    close.setAttribute("aria-label", "Dismiss");
    close.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${CLOSE}</svg>`;
    close.addEventListener("click", () => dismissAlert(alert.id));
    toast.append(close);

    getViewport().append(toast);
    toasts.set(alert.id, toast);
    if (alert.timeout) {
        timers.set(
            alert.id,
            setTimeout(() => dismissAlert(alert.id), alert.timeout),
        );
    }
}

export function dismissAlert(id: number) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    toasts.get(id)?.remove();
    toasts.delete(id);
    // Remove the host once empty so nothing lingers in the page.
    if (toasts.size === 0) {
        host?.remove();
        host = viewport = null;
    }
}
