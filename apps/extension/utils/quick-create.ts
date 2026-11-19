// Quick-create button for email inputs.
//
// Runs on every page, so it deliberately avoids React and Astryx: plain DOM +
// a few hundred bytes of CSS that mimic an Astryx primary IconButton (sm).
// Everything lives in a closed shadow root so page styles cannot leak in (and
// ours cannot leak out), and page scripts cannot reach in to click it.

import { colorScheme, type ContentSettings, watchSettings } from "./settings";

export type GenerateAliasResponse =
    | { success: true; alias: string }
    | { success: false; message: string };

type ButtonState = "idle" | "loading" | "success" | "error";

const EMAIL_INPUT_SELECTOR = 'input[type="email"], input[autocomplete~="email" i]';
const MAX_SIZE = 28; // Astryx sm IconButton
const MIN_SIZE = 20;
const RESULT_DURATION = 3000;

// Tabler icons (MIT), same set the app uses via react-icons.
const ICONS: Record<ButtonState, string> = {
    idle: '<path d="M12 19h-7a2 2 0 0 1 -2 -2v-10a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v5.5"/><path d="M16 19h6"/><path d="M19 16v6"/><path d="M3 7l9 6l9 -6"/>',
    loading: '<path d="M12 3a9 9 0 1 0 9 9"/>',
    success: '<path d="M5 12l5 5l10 -10"/>',
    error: '<path d="M12 9v4"/><path d="M10.363 3.591l-8.106 13.534a1.914 1.914 0 0 0 1.636 2.871h16.214a1.914 1.914 0 0 0 1.636 -2.87l-8.106 -13.536a1.914 1.914 0 0 0 -3.274 0"/><path d="M12 16h.01"/>',
};

const LABEL = "Create MailFlare alias for this site";

/** The host element's own styles, all set as important. */
const HOST_STYLES: Record<string, string> = {
    all: "initial",
    position: "fixed",
    "z-index": "2147483647",
    display: "block",
    margin: "0",
    padding: "0",
    border: "0",
    opacity: "1",
    visibility: "visible",
    transform: "none",
    filter: "none",
    "clip-path": "none",
    "pointer-events": "auto",
};

// Values taken from the Mailflare Astryx theme (neutral + orange accent).
const STYLES = `
button {
  --accent: light-dark(#e8590c, #fd7e14);
  --on-accent: light-dark(#ffffff, #111111);
  --overlay: light-dark(rgb(0 0 0 / 0.05), rgb(255 255 255 / 0.05));
  all: unset;
  box-sizing: border-box;
  display: grid;
  place-items: center;
  width: var(--size);
  height: var(--size);
  border-radius: 10px;
  background-color: var(--accent);
  color: var(--on-accent);
  cursor: pointer;
  transition: background-color 125ms cubic-bezier(0.24, 1, 0.4, 1),
    transform 125ms cubic-bezier(0.24, 1, 0.4, 1);
}
button:hover { background-image: linear-gradient(var(--overlay), var(--overlay)); }
button:active { transform: scale(0.94); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }
button[data-state="loading"] { cursor: progress; }
button[data-state="success"] { --accent: light-dark(#198100, #64af4c); }
button[data-state="error"] { --accent: light-dark(#c9303a, #ff705d); }
svg { width: 62%; height: 62%; fill: none; stroke: currentColor; stroke-width: 2;
  stroke-linecap: round; stroke-linejoin: round; }
button[data-state="loading"] svg { animation: spin 700ms linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  button, button[data-state="loading"] svg { transition: none; animation: none; }
}
`;

export function initQuickCreate(options: {
    generateAlias: () => Promise<GenerateAliasResponse>;
    onError: (message: string) => void;
}) {
    let settings: ContentSettings = {};
    let target: HTMLInputElement | null = null;
    let state: ButtonState = "idle";
    let resetTimer: ReturnType<typeof setTimeout> | undefined;
    let frame = 0;

    const host = document.createElement("mailflare-quick-create");
    // Important inline styles beat page CSS targeting the host element, even
    // with !important: a page can't make the button invisible or move it
    // under something the user means to click.
    const setHostStyle = (name: string, value: string) =>
        host.style.setProperty(name, value, "important");
    for (const [name, value] of Object.entries(HOST_STYLES)) setHostStyle(name, value);
    const shadow = host.attachShadow({ mode: "closed" });
    const style = document.createElement("style");
    style.textContent = STYLES;
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", LABEL);
    button.title = LABEL;
    shadow.append(style, button);
    setState("idle");

    function setState(next: ButtonState, message?: string) {
        state = next;
        button.dataset.state = next;
        button.title = message ?? LABEL;
        button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[next]}</svg>`;
    }

    function position() {
        frame = 0;
        if (!target) return;
        const rect = target.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return hide();
        const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rect.height - 8));
        const inset = Math.max(4, (rect.height - size) / 2);
        // On the button itself: a custom property on the host could be set by the page.
        button.style.setProperty("--size", `${size}px`);
        setHostStyle("top", `${rect.top + (rect.height - size) / 2}px`);
        setHostStyle("left", `${rect.right - size - inset}px`);
    }

    const schedulePosition = () => {
        if (!frame) frame = requestAnimationFrame(position);
    };

    // Follows the app's theme setting; light-dark() in the CSS resolves against it.
    function applyTheme() {
        setHostStyle("color-scheme", colorScheme(settings));
    }

    function show(input: HTMLInputElement) {
        target = input;
        applyTheme();
        if (!host.isConnected) document.documentElement.append(host);
        position();
        window.addEventListener("scroll", schedulePosition, { capture: true, passive: true });
        window.addEventListener("resize", schedulePosition, { passive: true });
    }

    function hide() {
        target = null;
        host.remove();
        window.removeEventListener("scroll", schedulePosition, { capture: true });
        window.removeEventListener("resize", schedulePosition);
    }

    function onFocusIn(event: FocusEvent) {
        const el = event.target;
        if (el instanceof HTMLInputElement && el.matches(EMAIL_INPUT_SELECTOR) && !el.readOnly) {
            show(el);
        }
    }

    function onFocusOut(event: FocusEvent) {
        // Keep the button while focus moves onto it (keyboard users tabbing over).
        if (event.target === target && event.relatedTarget !== host) hide();
    }

    // Keep focus in the input when the button is clicked with the mouse.
    button.addEventListener("mousedown", (event) => event.preventDefault());
    // Keyboard focus leaving the button for anything but its input hides it.
    button.addEventListener("blur", (event) => {
        if (event.relatedTarget !== target) hide();
    });

    button.addEventListener("click", async (event) => {
        // Ignore clicks synthesized by page scripts: only the user may create aliases.
        if (!event.isTrusted || state === "loading" || !target) return;
        const input = target;

        clearTimeout(resetTimer);
        setState("loading");
        let response: GenerateAliasResponse;
        try {
            response = await options.generateAlias();
        } catch (error) {
            response = { success: false, message: String(error) };
        }

        if (response.success) {
            fillInput(input, response.alias);
            if (settings.copyAlias) {
                // May fail if the user activation expired during the request.
                navigator.clipboard.writeText(response.alias).catch(() => {});
            }
            setState("success", response.alias);
        } else {
            setState("error", response.message);
            options.onError(response.message);
        }
        resetTimer = setTimeout(() => setState("idle"), RESULT_DURATION);
    });

    function enable() {
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", onFocusOut, true);
        // An email input may already be focused (e.g. autofocus).
        const active = document.activeElement;
        if (active instanceof HTMLInputElement && active.matches(EMAIL_INPUT_SELECTOR)) {
            show(active);
        }
    }

    function disable() {
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", onFocusOut, true);
        hide();
    }

    function applySettings(next: ContentSettings) {
        const wasEnabled = !!settings.showCreateButton;
        settings = next;
        if (settings.showCreateButton && !wasEnabled) enable();
        else if (!settings.showCreateButton && wasEnabled) disable();
        applyTheme();
    }

    watchSettings(applySettings);
}

// Sets an input's value so that framework-controlled inputs (React, Vue, ...)
// pick it up: use the native setter, then fire the events they listen for.
function fillInput(input: HTMLInputElement, value: string) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}
