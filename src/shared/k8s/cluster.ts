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

export const namespaceSchema = z.object({
    name: z.string(),
    pods: z.number().int().nonnegative(),
    /** `accent` marks the active namespace, `ok` an Active one, `warn` anything else (Terminating). */
    tone: namespaceToneSchema,
});

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
export type ActiveNamespace = z.infer<typeof activeNamespaceSchema>;
