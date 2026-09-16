import { z } from 'zod';
import { namespaceNameSchema } from './names.js';
import { KIND_REGISTRY, KINDS, type Kind } from './registry.js';

/**
 * Who controls an object, and who controls them. A pod's chain reads ReplicaSet then Deployment,
 * a job's reads CronJob, and a pod nothing owns has none at all. The chain is what turns a pod
 * into the workload it belongs to, which is the question every screen around it ends up asking.
 */

export const ownerLinkSchema = z.object({
    /** The owner's kind as the API reports it, including kinds the app has no screen for. */
    kind: z.string(),
    name: z.string(),
    namespace: z.string(),
    /** The screen showing this object, or null when the app cannot show that kind yet. */
    path: z.string().nullable(),
});

/** Immediate owner first, then its own owner: ReplicaSet, then the Deployment behind it. */
export const ownerChainSchema = z.array(ownerLinkSchema);

/** Controllers whose pods can be listed: every kind that owns pods, directly or through a Job. */
export const POD_OWNER_KINDS = ['Deployment', 'StatefulSet', 'DaemonSet', 'Job', 'CronJob'] as const;
export const podOwnerKindSchema = z.enum(POD_OWNER_KINDS);

export const ownedPodsInputSchema = z.object({
    kind: podOwnerKindSchema,
    name: z.string().min(1),
    namespace: namespaceNameSchema,
});

export type OwnerLink = z.infer<typeof ownerLinkSchema>;
export type OwnerChain = z.infer<typeof ownerChainSchema>;
export type PodOwnerKind = z.infer<typeof podOwnerKindSchema>;
export type OwnedPodsInput = z.infer<typeof ownedPodsInputSchema>;

/** Kinds whose pods a rollout restart replaces; a pod owned by one of these can be restarted. */
export const RESTARTABLE_OWNER_KINDS: readonly string[] = ['Deployment', 'StatefulSet', 'DaemonSet'];

const KIND_BY_NAME = new Map<string, Kind>(KINDS.map((kind) => [KIND_REGISTRY[kind].kind, kind]));

/**
 * The screen for one owner, or null when the app has no list for that kind — a ReplicaSet today,
 * until the missing built-in kinds arrive. Derived from the registry so a new kind's detail route
 * becomes linkable the moment it is registered.
 */
export function ownerPath(kind: string, name: string, namespace: string): string | null {
    const registered = KIND_BY_NAME.get(kind);
    if (!registered) return null;
    const info = KIND_REGISTRY[registered];
    return info.clusterScoped ? `${info.listPath}/${name}` : `${info.listPath}/${namespace}/${name}`;
}

/** The first owner in the chain a rollout restart would act on, if any. */
export function restartableOwner(chain: OwnerChain): OwnerLink | undefined {
    return chain.find((link) => RESTARTABLE_OWNER_KINDS.includes(link.kind));
}
