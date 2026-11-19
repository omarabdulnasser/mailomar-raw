import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// `--mode worker` builds the app a Mailflare Worker serves itself: locked to
// that Worker, with its API on the same origin.
export default defineConfig(({ mode }) => ({
    define: {
        "import.meta.env.VITE_LOCKED_WORKER": JSON.stringify(mode === "worker"),
    },
    plugins: [
        react(),
        VitePWA({
            registerType: "autoUpdate",
            workbox: {
                // Links into the Worker's API (email verification, magic links)
                // must reach the Worker, not the cached app.
                navigateFallbackDenylist: [/^\/api\//],
            },
            manifest: {
                name: "Mailflare",
                short_name: "Mailflare",
                description: "Create email aliases with Cloudflare Email Routing",
                theme_color: "#e8590c",
                background_color: "#ffffff",
                display: "standalone",
                icons: [
                    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
                    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
                ],
            },
        }),
    ],
    build: {
        rolldownOptions: {
            output: {
                // React changes rarely: its own file stays cached when the app
                // is updated. (Not Astryx: a group would also pull in the parts
                // it loads on demand.)
                codeSplitting: {
                    groups: [
                        {
                            name: "react",
                            test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
                        },
                    ],
                },
            },
        },
    },
    server: {
        proxy: {
            "/api": {
                target: "https://api.cloudflare.com/client/v4",
                changeOrigin: true,
                rewrite: (path) => path.replace(/^\/api/, ""),
            },
        },
    },
}));
