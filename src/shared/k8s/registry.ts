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
    Deployment: {
        kind: 'Deployment',
        apiVersion: 'apps/v1',
        clusterScoped: false,
        scalable: true,
        listPath: '/workloads/deployments',
    },
    StatefulSet: {
        kind: 'StatefulSet',
        apiVersion: 'apps/v1',
        clusterScoped: false,
        scalable: true,
        listPath: '/workloads/statefulsets',
    },
    DaemonSet: {
        kind: 'DaemonSet',
        apiVersion: 'apps/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/workloads/daemonsets',
    },
    Job: { kind: 'Job', apiVersion: 'batch/v1', clusterScoped: false, scalable: false, listPath: '/workloads/jobs' },
    CronJob: {
        kind: 'CronJob',
        apiVersion: 'batch/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/workloads/cronjobs',
    },
    HorizontalPodAutoscaler: {
        kind: 'HorizontalPodAutoscaler',
        apiVersion: 'autoscaling/v2',
        clusterScoped: false,
        scalable: false,
        listPath: '/workloads/autoscalers',
    },
    ConfigMap: {
        kind: 'ConfigMap',
        apiVersion: 'v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/workloads/configmaps',
    },
    Secret: { kind: 'Secret', apiVersion: 'v1', clusterScoped: false, scalable: false, listPath: '/workloads/secrets' },
    Service: {
        kind: 'Service',
        apiVersion: 'v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/network/services',
    },
    Ingress: {
        kind: 'Ingress',
        apiVersion: 'networking.k8s.io/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/network/ingresses',
    },
    Endpoints: {
        kind: 'Endpoints',
        apiVersion: 'v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/network/endpoints',
    },
    NetworkPolicy: {
        kind: 'NetworkPolicy',
        apiVersion: 'networking.k8s.io/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/network/networkpolicies',
    },
    PersistentVolume: {
        kind: 'PersistentVolume',
        apiVersion: 'v1',
        clusterScoped: true,
        scalable: false,
        listPath: '/storage/volumes',
    },
    PersistentVolumeClaim: {
        kind: 'PersistentVolumeClaim',
        apiVersion: 'v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/storage/claims',
    },
    StorageClass: {
        kind: 'StorageClass',
        apiVersion: 'storage.k8s.io/v1',
        clusterScoped: true,
        scalable: false,
        listPath: '/storage/storageclasses',
    },
    VolumeSnapshot: {
        kind: 'VolumeSnapshot',
        apiVersion: 'snapshot.storage.k8s.io/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/storage/snapshots',
    },
    ServiceAccount: {
        kind: 'ServiceAccount',
        apiVersion: 'v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/access/serviceaccounts',
    },
    Role: {
        kind: 'Role',
        apiVersion: 'rbac.authorization.k8s.io/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/access/roles',
    },
    RoleBinding: {
        kind: 'RoleBinding',
        apiVersion: 'rbac.authorization.k8s.io/v1',
        clusterScoped: false,
        scalable: false,
        listPath: '/access/rolebindings',
    },
    ClusterRole: {
        kind: 'ClusterRole',
        apiVersion: 'rbac.authorization.k8s.io/v1',
        clusterScoped: true,
        scalable: false,
        listPath: '/access/clusterroles',
    },
    ClusterRoleBinding: {
        kind: 'ClusterRoleBinding',
        apiVersion: 'rbac.authorization.k8s.io/v1',
        clusterScoped: true,
        scalable: false,
        listPath: '/access/clusterrolebindings',
    },
    CustomResourceDefinition: {
        kind: 'CustomResourceDefinition',
        apiVersion: 'apiextensions.k8s.io/v1',
        clusterScoped: true,
        scalable: false,
        listPath: '/addons/crds',
    },
} as const satisfies Record<string, KindInfo>;

export type Kind = keyof typeof KIND_REGISTRY;

export const KINDS = Object.keys(KIND_REGISTRY) as [Kind, ...Kind[]];
export const kindSchema = z.enum(KINDS);

export function kindInfo(kind: Kind): KindInfo {
    return KIND_REGISTRY[kind];
}
