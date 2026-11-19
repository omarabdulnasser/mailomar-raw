import { CloudflareBackend } from "./cloudflare-backend";
import type { AliasBackend, Connection } from "./types";
import { WorkerBackend } from "./worker-backend";

/**
 * Creates the backend for a connection. `cloudflareApiBaseUrl` overrides the
 * Cloudflare API origin (the web app goes through a CORS proxy).
 */
export function createBackend(connection: Connection, cloudflareApiBaseUrl?: string): AliasBackend {
    return connection.kind === "worker"
        ? new WorkerBackend(connection.url, connection.token)
        : new CloudflareBackend(connection.token, cloudflareApiBaseUrl);
}

/** Checks a connection's credentials; returns an error message, or null if they work. */
export function verifyConnection(
    connection: Connection,
    cloudflareApiBaseUrl?: string,
): Promise<string | null> {
    return connection.kind === "worker"
        ? WorkerBackend.verify(connection.url, connection.token)
        : CloudflareBackend.verifyToken(connection.token, cloudflareApiBaseUrl);
}
