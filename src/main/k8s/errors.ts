import { ApiException } from '@kubernetes/client-node';

/** Coarse classification of why a cluster call failed, surfaced to the renderer. */
export type K8sErrorKind =
    'unreachable' | 'forbidden' | 'unauthorized' | 'notFound' | 'conflict' | 'invalid' | 'unknown';

/**
 * A cluster call failure. `ipcRenderer.invoke` only conveys `error.message` across the bridge, so
 * the kind is encoded as a `[kind]` prefix in the message and the renderer parses it back out.
 */
export class K8sError extends Error {
    constructor(
        public readonly kind: K8sErrorKind,
        detail: string,
        public readonly op: string,
    ) {
        super(`[${kind}] ${detail}`);
        this.name = 'K8sError';
    }
}

function statusOf(error: unknown): number | undefined {
    if (error instanceof ApiException) return error.code;
    if (!error || typeof error !== 'object') return undefined;
    const { code, statusCode } = error as { code?: unknown; statusCode?: unknown };
    const candidate = code ?? statusCode;
    return typeof candidate === 'number' ? candidate : undefined;
}

/**
 * errno, TLS and DNS codes (and error names) that mean "could not reach or trust the API server".
 * TLS-trust failures are routine against private cluster CAs, so they read as `unreachable` rather
 * than a mysterious `unknown`. `AbortError` is a name, not a code: a timed-out or aborted read.
 */
const CONNECTION_CODES = new Set([
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ECONNRESET',
    'EPIPE',
    'EAI_AGAIN',
    'AbortError',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
    'DEPTH_ZERO_SELF_SIGNED_CERT',
    'SELF_SIGNED_CERT_IN_CHAIN',
    'CERT_HAS_EXPIRED',
    'ERR_TLS_CERT_ALTNAME_INVALID',
]);

/**
 * Collect every `code` and `name` across an error's whole `cause` chain and any `AggregateError`
 * branches. Fetch nests the original errno one or more levels down in `cause`, and a failed
 * multi-address connect surfaces as an `AggregateError`; a single-level peek misses both.
 */
function collectCodes(error: unknown, seen = new Set<unknown>()): string[] {
    if (!error || typeof error !== 'object' || seen.has(error)) return [];
    seen.add(error);
    const e = error as { code?: unknown; name?: unknown; cause?: unknown; errors?: unknown };
    const codes: string[] = [];
    if (typeof e.code === 'string') codes.push(e.code);
    if (typeof e.name === 'string') codes.push(e.name);
    if (e.cause) codes.push(...collectCodes(e.cause, seen));
    if (Array.isArray(e.errors)) for (const sub of e.errors) codes.push(...collectCodes(sub, seen));
    return codes;
}

function isConnectionError(error: unknown): boolean {
    return collectCodes(error).some((code) => CONNECTION_CODES.has(code));
}

/**
 * The human-readable failure text. `ApiException.message` is a multi-line HTTP dump; the useful
 * sentence (for example `services "web" already exists`) is the response body's `Status.message`.
 */
function detailOf(error: unknown): string {
    if (error instanceof ApiException) {
        const body = (error as ApiException<unknown>).body as { message?: unknown } | null | undefined;
        if (body && typeof body.message === 'string' && body.message) return body.message;
    }
    return error instanceof Error ? error.message : String(error);
}

function classify(op: string, error: unknown): K8sError {
    const status = statusOf(error);
    if (status === 403) return new K8sError('forbidden', 'Access denied (RBAC).', op);
    if (status === 401) return new K8sError('unauthorized', 'Not authenticated to the cluster.', op);
    if (status === 404) return new K8sError('notFound', 'Resource or API not found.', op);
    // Write-path statuses: 409 is an existing object or a resourceVersion conflict, 400 and 422 a
    // rejected manifest. Both carry the server's own message as detail.
    if (status === 409) return new K8sError('conflict', detailOf(error), op);
    if (status === 400 || status === 422) return new K8sError('invalid', detailOf(error), op);
    if (isConnectionError(error)) return new K8sError('unreachable', 'The cluster API server is unreachable.', op);
    return new K8sError('unknown', detailOf(error), op);
}

/**
 * Ceiling on a single cluster read. Without it an unreachable context waits out the OS TCP timeout
 * (60 to 75 s), hanging the UI. On expiry the read rejects as `unreachable`.
 */
export const READ_TIMEOUT_MS = 15_000;

async function withTimeout<T>(op: string, ms: number, fn: () => Promise<T>): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
            () => reject(new K8sError('unreachable', `Timed out after ${ms / 1000}s waiting for the cluster.`, op)),
            ms,
        );
    });
    try {
        return await Promise.race([fn(), timeout]);
    } finally {
        if (timer) clearTimeout(timer);
    }
}

/** Run a cluster call under the read timeout, normalising any failure into a {@link K8sError}. */
export async function withK8s<T>(op: string, fn: () => Promise<T>, timeoutMs = READ_TIMEOUT_MS): Promise<T> {
    try {
        return await withTimeout(op, timeoutMs, fn);
    } catch (error) {
        if (error instanceof K8sError) throw error;
        throw classify(op, error);
    }
}
