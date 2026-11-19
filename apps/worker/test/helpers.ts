import { createExecutionContext, waitOnExecutionContext } from "cloudflare:test";
import { env } from "cloudflare:workers";

import { app } from "../src/api";

export const TOKEN = "test-admin-token";

export type SentMail = { from: unknown; to: unknown; subject: string; text: string };

/** Account emails the Worker sent during the tests, oldest first. */
export const outbox: SentMail[] = [];

const recordingEmail = {
    send: async (message: SentMail) => {
        outbox.push(message);
        return { messageId: "test" };
    },
} as unknown as SendEmail;

/** The newest email sent to this address, if any. */
export const lastMailTo = (address: string) => outbox.findLast((mail) => mail.to === address);

/** The first link in an email. */
export const linkIn = (mail: SentMail | undefined) => {
    const link = mail?.text.match(/https?:\/\/\S+/)?.[0];
    if (!link) throw new Error(`No link in email: ${JSON.stringify(mail)}`);
    return link;
};

const randomIp = () => Array.from(crypto.getRandomValues(new Uint8Array(4))).join(".");

type Options = { env?: Partial<Env>; headers?: Record<string, string> };

/** Calls the Worker over HTTP, with emails going to `outbox`. */
export async function request(method: string, path: string, body?: unknown, options?: Options) {
    const headers = new Headers(options?.headers);
    if (body !== undefined) headers.set("Content-Type", "application/json");
    // A distinct client per request, so auth rate limits don't trip.
    if (!headers.has("cf-connecting-ip")) headers.set("cf-connecting-ip", randomIp());
    const url = path.startsWith("http") ? path : `https://worker.test${path}`;
    const ctx = createExecutionContext();
    const response = await app.fetch(
        new Request(url, {
            method,
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
            redirect: "manual",
        }),
        { ...env, EMAIL: recordingEmail, ...options?.env },
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

/** Calls the Worker's API, as the admin token by default. */
export async function api<T = unknown>(
    method: string,
    path: string,
    body?: unknown,
    token: string | null = TOKEN,
    options?: Options,
): Promise<{ status: number; body: T }> {
    const response = await request(method, path, body, {
        ...options,
        headers: {
            ...options?.headers,
            ...(token !== null && { Authorization: `Bearer ${token}` }),
        },
    });
    const text = await response.text();
    let parsed: unknown = null;
    try {
        parsed = text ? JSON.parse(text) : null;
    } catch {
        parsed = text;
    }
    return { status: response.status, body: parsed as T };
}

/** Creates a domain, a destination and an alias on it; returns the alias. */
export async function seedAlias(address: string, destination = "me@inbox.test") {
    const domain = address.split("@")[1]!;
    await api("POST", "/api/v1/domains", { name: domain });
    await api("POST", "/api/v1/destinations", { email: destination });
    const { status, body } = await api<{ id: string; address: string }>("POST", "/api/v1/aliases", {
        address,
        destination,
    });
    if (status !== 201) throw new Error(`seedAlias failed: ${status} ${JSON.stringify(body)}`);
    return body;
}

export const PASSWORD = "correct horse battery staple";

/** Signs in with email and password; returns the bearer session token. */
export async function signIn(email: string, options?: Options) {
    const response = await request(
        "POST",
        "/api/auth/sign-in/email",
        { email, password: PASSWORD },
        options,
    );
    const token = response.headers.get("set-auth-token");
    if (!response.ok || !token) {
        throw new Error(`Sign-in failed: ${response.status} ${await response.text()}`);
    }
    return token;
}

/**
 * Confirms an account's email as the app's /verify-email page does after the
 * click: with the token from the verification email.
 */
export async function confirmEmail(email: string) {
    const link = new URL(linkIn(lastMailTo(email)));
    const token = link.searchParams.get("token");
    if (link.pathname !== "/verify-email" || !token)
        throw new Error(`Not a verification link: ${link}`);
    return request("GET", `/api/auth/verify-email?token=${encodeURIComponent(token)}`);
}

/** The extension's identity.launchWebAuthFlow redirect in Chrome. */
export const EXTENSION_REDIRECT = "https://aomfbgcabccoecaoimicmmkjdmdgcfpi.chromiumapp.org/";

/** Signs up, confirms the email, and signs in; returns the session token. */
export async function signUp(email: string) {
    const response = await request("POST", "/api/auth/sign-up/email", {
        email,
        password: PASSWORD,
        name: email.split("@")[0],
    });
    if (!response.ok)
        throw new Error(`Sign-up failed: ${response.status} ${await response.text()}`);
    await confirmEmail(email);
    return signIn(email);
}
