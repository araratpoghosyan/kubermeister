import { z } from 'zod';
import { clusterStatusSchema } from './status.js';

export const clusterSchema = z.object({
    /** The kube-context name. */
    name: z.string(),
    nodes: z.number().int().nonnegative(),
    status: clusterStatusSchema,
    /** Server version without the leading `v`, or an em-dash when unreachable. */
    version: z.string(),
    provider: z.string(),
    region: z.string(),
});

export const namespaceToneSchema = z.enum(['accent', 'ok', 'warn']);

export const namespaceSchema = z.object({
    name: z.string(),
    pods: z.number().int().nonnegative(),
    /** `accent` marks the active namespace, `ok` an Active one, `warn` anything else (Terminating). */
    tone: namespaceToneSchema,
});

/**
 * The active selection: `name` is null under "All namespaces", never a display label, so no caller
 * can mistake the label for a namespace and hand it to a cluster call.
 */
export const activeNamespaceSchema = namespaceSchema.extend({ name: z.string().nullable() });

export type Cluster = z.infer<typeof clusterSchema>;
export type NamespaceTone = z.infer<typeof namespaceToneSchema>;
export type Namespace = z.infer<typeof namespaceSchema>;
export type ActiveNamespace = z.infer<typeof activeNamespaceSchema>;
