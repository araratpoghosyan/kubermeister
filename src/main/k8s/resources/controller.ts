import type { V1ObjectMeta, V1OwnerReference } from '@kubernetes/client-node';

/*
 * Who controls an object. Kept in a module of its own with no dependencies, because the pod, the
 * workload and the ownership readers all ask the same question of each other's objects, and a
 * shared import between them would be a cycle.
 */

/** The reference that controls an object, or the first one when none is marked as controller. */
export function controllerRef(metadata?: V1ObjectMeta): V1OwnerReference | undefined {
    const refs = metadata?.ownerReferences ?? [];
    return refs.find((ref) => ref.controller) ?? refs[0];
}

/** `Kind/name` of that controller, which for a pod is its ReplicaSet and for one is its Deployment. */
export function ownerLabel(metadata?: V1ObjectMeta): string {
    const ref = controllerRef(metadata);
    return ref ? `${ref.kind}/${ref.name}` : '—';
}
