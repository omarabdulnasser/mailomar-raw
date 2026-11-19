// Accounts on a Mailflare Worker (better-auth). The app keeps using the
// session token as a bearer token, like the admin token, so it works the same
// in the web app, the Worker-served app and the extension.

import { passkeyClient } from "@better-auth/passkey/client";
import { createAuthClient } from "better-auth/client";
import { magicLinkClient } from "better-auth/client/plugins";
import ky, { isHTTPError } from "ky";

export type AccountClient = ReturnType<typeof createAccountClient>;

/** A client for the Worker's `/api/auth`; `token` signs requests in, if given. */
export function createAccountClient(workerUrl: string, token?: string) {
    return createAuthClient({
        baseURL: workerUrl,
        basePath: "/api/auth",
        plugins: [magicLinkClient(), passkeyClient()],
        fetchOptions: token ? { auth: { type: "Bearer", token } } : undefined,
    });
}

type AuthError = { code?: string; message?: string; status: number };

/** An error from the Worker's account endpoints, with better-auth's code. */
export class AccountError extends Error {
    readonly code: string;
    readonly status: number;

    constructor(error: AuthError) {
        super(error.message || `Request failed (${error.status})`);
        this.code = error.code ?? "UNKNOWN";
        this.status = error.status;
    }
}

type FetchOptions = { onSuccess: (context: { response: Response }) => void };

/** Throws an AccountError if a better-auth client call failed. */
export async function unwrap<T extends { error: AuthError | null }>(call: Promise<T>) {
    const result = await call;
    if (result.error) throw new AccountError(result.error);
    return result;
}

/**
 * Runs a call that signs in and returns the new session token, which the
 * Worker sends in the `set-auth-token` header.
 */
export async function signInWith(
    call: (fetchOptions: FetchOptions) => Promise<{ error: AuthError | null }>,
): Promise<string> {
    let token: string | null = null;
    await unwrap(
        call({
            onSuccess: ({ response }) => {
                token = response.headers.get("set-auth-token");
            },
        }),
    );
    if (!token) throw new Error("The Worker didn't return a session");
    return token;
}

/**
 * The session token of a cookie session on the Worker's origin, which email
 * links (verification, magic links) leave behind; null if there is none.
 */
export async function sessionFromCookie(workerUrl: string): Promise<string | null> {
    const { data } = await createAccountClient(workerUrl).getSession();
    return data?.session.token ?? null;
}

/**
 * Ends an account session (harmless for the admin token). Through the Worker's
 * API rather than better-auth's sign-out, which refuses other origins such as
 * the extension's. Throws if the Worker couldn't be reached; a session that
 * already ended (401) counts as signed out.
 */
export async function signOutAccount(workerUrl: string, token: string) {
    try {
        await ky.delete(`${workerUrl}/api/v1/session`, {
            headers: { Authorization: `Bearer ${token}` },
            retry: 0,
        });
    } catch (error) {
        if (!(isHTTPError(error) && error.response.status === 401)) throw error;
    }
}

/**
 * Creates a separate session for the extension, which asked for it with its
 * `identity.launchWebAuthFlow` redirect URL; returns the session's token.
 */
export async function createAppSession(
    workerUrl: string,
    token: string,
    redirectUri: string,
): Promise<string> {
    const { token: appToken } = await ky
        .post(`${workerUrl}/api/v1/sessions`, {
            headers: { Authorization: `Bearer ${token}` },
            json: { redirectUri },
            retry: 0,
        })
        .json<{ token: string }>();
    return appToken;
}

/**
 * Verifies an account's email with the token from its verification email.
 * The Worker answers with a cookie session on its origin (see sessionFromCookie).
 */
export async function verifyAccountEmail(workerUrl: string, token: string) {
    await unwrap(createAccountClient(workerUrl).verifyEmail({ query: { token } }));
}

/** Confirms a destination with the token from its confirmation email. */
export async function verifyDestination(workerUrl: string, token: string) {
    await ky.post(`${workerUrl}/api/verify-destination`, { json: { token }, retry: 0 });
}
