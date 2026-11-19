// Proxy for the Cloudflare API, which browsers can't call directly (CORS).
// Only the web app on this origin uses it, and only for the endpoints
// Mailflare needs; it isn't a general relay for the Cloudflare API.

const CLOUDFLARE_API_BASE_URL = "https://api.cloudflare.com/client/v4";

const ID = "[A-Za-z0-9-]+";

/** Method and path (below /client/v4) of every request the app makes. */
const ALLOWED: [method: string, path: RegExp][] = [
    ["GET", /^user\/tokens\/verify$/],
    ["GET", /^zones$/],
    ["GET", new RegExp(`^accounts/${ID}/email/routing/addresses$`)],
    ["GET", new RegExp(`^zones/${ID}/email/routing$`)],
    ["GET", new RegExp(`^zones/${ID}/email/routing/rules$`)],
    ["POST", new RegExp(`^zones/${ID}/email/routing/rules$`)],
    ["PUT", new RegExp(`^zones/${ID}/email/routing/rules/${ID}$`)],
    ["DELETE", new RegExp(`^zones/${ID}/email/routing/rules/${ID}$`)],
];

/** Request headers passed on: the token and the body's type, nothing else (no cookies). */
const FORWARDED_HEADERS = ["Authorization", "Content-Type"];

const json = (status: number, message: string) =>
    Response.json(
        { success: false, errors: [{ code: status, message }], messages: [] },
        { status },
    );

export const onRequest: PagesFunction = async ({ request }) => {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^\/api\//, "");
    if (!ALLOWED.some(([method, pattern]) => method === request.method && pattern.test(path))) {
        return json(404, "Not available through the Mailflare proxy");
    }

    const headers = new Headers();
    for (const name of FORWARDED_HEADERS) {
        const value = request.headers.get(name);
        if (value) headers.set(name, value);
    }

    try {
        const response = await fetch(`${CLOUDFLARE_API_BASE_URL}/${path}${url.search}`, {
            method: request.method,
            headers,
            body:
                request.method === "GET" || request.method === "DELETE" ? undefined : request.body,
        });
        // The JSON answer only: no cookies or other headers of api.cloudflare.com.
        return new Response(response.body, {
            status: response.status,
            statusText: response.statusText,
            headers: {
                "Content-Type": response.headers.get("Content-Type") ?? "application/json",
                "Cache-Control": "no-store",
            },
        });
    } catch {
        return json(502, "The Cloudflare API could not be reached");
    }
};
