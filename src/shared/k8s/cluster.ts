import { z } from 'zod';
import { k8sErrorKindSchema } from './errors.js';
import { clusterStatusSchema } from './status.js';

/** Why the active context's API server could not be asked, classified like any other failed call. */
export const connectionProblemSchema = z.object({
    kind: k8sErrorKindSchema,
    detail: z.string(),
});

export const clusterSchema = z.object({
    /** The kube-context name. */
    name: z.string(),
    nodes: z.number().int().nonnegative(),
    status: clusterStatusSchema,
    /** Server version without the leading `v`, or an em-dash when unreachable. */
    version: z.string(),
    provider: z.string(),
    region: z.string(),
    /**
     * Present when the facts above come from the kubeconfig alone because the API server did not
     * answer; the renderer shows it where the user would otherwise wait on skeletons.
     */
    problem: connectionProblemSchema.optional(),
});

export const namespaceToneSchema = z.enum(['accent', 'ok', 'warn']);

/**
 * A namespace as the selector, the palette and the startup prime need it: the namespace objects
 * alone, which is a small, fast list. Pod counts are a whole-cluster pod list and travel separately.
 */
export const namespaceSchema = z.object({
    name: z.string(),
    /** `accent` marks the active namespace, `ok` an Active one, `warn` anything else (Terminating). */
    tone: namespaceToneSchema,
});

/**
 * How many pods the cluster holds, learned from the list metadata of a one-item list rather than
 * from listing them; null when the API server would not say (a list served from its cache).
 */
export const podCountSchema = z.object({ total: z.number().int().nonnegative().nullable() });

/**
 * The active selection: `name` is null under "All namespaces", never a display label, so no caller
 * can mistake the label for a namespace and hand it to a cluster call. It is answered from memory,
 * without a cluster call, so the selection is known at once and stays known when the cluster is
 * not; the pod count beside it comes from the namespace list.
 */
export const activeNamespaceSchema = z.object({ name: z.string().nullable() });

export type Cluster = z.infer<typeof clusterSchema>;
export type ConnectionProblem = z.infer<typeof connectionProblemSchema>;
export type NamespaceTone = z.infer<typeof namespaceToneSchema>;
export type Namespace = z.infer<typeof namespaceSchema>;
export type PodCount = z.infer<typeof podCountSchema>;
export type ActiveNamespace = z.infer<typeof activeNamespaceSchema>;
