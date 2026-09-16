import { z } from 'zod';
import { namespaceNameSchema } from './names.js';
import { KIND_REGISTRY, KINDS } from './registry.js';

/**
 * Kinds whose live manifest can be read. Nodes and namespaces are not in the kind registry (they
 * have bespoke channels of their own) but their details show a manifest like every other object,
 * and a namespace is created and deleted through the same write path, so the vocabulary is the
 * registry's kinds plus those two.
 */
export const manifestKindSchema = z.enum([...KINDS, 'Node', 'Namespace']);

export type ManifestKind = z.infer<typeof manifestKindSchema>;

/** Whether a kind string names a kind whose object can be read through the manifest channels. */
export function isManifestKind(kind: string | undefined): kind is ManifestKind {
    return !!kind && manifestKindSchema.safeParse(kind).success;
}

export function isClusterScopedManifestKind(kind: ManifestKind): boolean {
    return kind === 'Node' || kind === 'Namespace' || KIND_REGISTRY[kind].clusterScoped;
}

/**
 * Kinds whose deletion reaches far beyond the object itself: a node takes its workloads, a CRD
 * takes every custom resource of its type, the rest are cluster-wide plumbing. Their delete asks
 * the user to type the name, and they are kept out of bulk delete.
 */
export const DANGEROUS_KINDS: ReadonlySet<ManifestKind> = new Set<ManifestKind>([
    'Node',
    // Deleting a namespace takes every object inside it, which is the furthest-reaching delete here.
    'Namespace',
    'CustomResourceDefinition',
    'PersistentVolume',
    'StorageClass',
    'ClusterRole',
    'ClusterRoleBinding',
]);

/**
 * A namespaced kind must name its namespace and a cluster-scoped kind must not. Applied to every
 * per-object input so a caller can neither omit the namespace (which would fall back to whatever
 * is active) nor attach one where it means nothing.
 */
export function refineManifestTarget(target: { kind: ManifestKind; namespace?: string }, ctx: z.RefinementCtx): void {
    const clusterScoped = isClusterScopedManifestKind(target.kind);
    if (!clusterScoped && target.namespace === undefined) {
        ctx.addIssue({ code: 'custom', path: ['namespace'], message: `${target.kind} requires a namespace` });
    }
    if (clusterScoped && target.namespace !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['namespace'], message: `${target.kind} is cluster-scoped` });
    }
}

export const manifestInputSchema = z
    .object({
        kind: manifestKindSchema,
        name: z.string().min(1),
        namespace: namespaceNameSchema.optional(),
    })
    .superRefine(refineManifestTarget);

export const manifestSchema = z.object({
    yaml: z.string(),
    kind: z.string(),
    namespace: z.string().optional(),
});

export type ManifestInput = z.infer<typeof manifestInputSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
