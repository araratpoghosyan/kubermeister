import { z } from 'zod';

/**
 * One entry per resource kind the app knows. Every kind-keyed map derives from this so adding a
 * kind is one edit here plus its transforms in `src/main/k8s/resources`.
 */
export interface KindInfo {
    /** Canonical Kind as it appears in manifests and API responses. */
    kind: string;
    apiVersion: string;
    /** True for kinds that live outside any namespace. */
    clusterScoped: boolean;
    /** True for kinds exposing a `/scale` subresource the app drives. */
    scalable: boolean;
    /** The list screen for this kind (hash-route path). */
    listPath: string;
}

export const KIND_REGISTRY = {
    Pod: { kind: 'Pod', apiVersion: 'v1', clusterScoped: false, scalable: false, listPath: '/workloads/pods' },
} as const satisfies Record<string, KindInfo>;

export type Kind = keyof typeof KIND_REGISTRY;

export const KINDS = Object.keys(KIND_REGISTRY) as [Kind, ...Kind[]];
export const kindSchema = z.enum(KINDS);

export function kindInfo(kind: Kind): KindInfo {
    return KIND_REGISTRY[kind];
}
