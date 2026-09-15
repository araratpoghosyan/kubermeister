import { z } from 'zod';

/** Coarse classification of why a cluster call failed, shown to the user. */
export const k8sErrorKindSchema = z.enum([
    'unreachable',
    'forbidden',
    'unauthorized',
    'notFound',
    'conflict',
    'invalid',
    'unknown',
]);

/**
 * A classified failure carried inside the IPC result envelope instead of a thrown exception, so the
 * renderer receives structure rather than a message string to parse.
 */
export const ipcErrorSchema = z.object({
    kind: k8sErrorKindSchema,
    /** Human-readable reason, safe to show. */
    detail: z.string(),
    /** The operation that failed, e.g. `nodes.list`. */
    op: z.string(),
});

export type K8sErrorKind = z.infer<typeof k8sErrorKindSchema>;
export type IpcError = z.infer<typeof ipcErrorSchema>;
