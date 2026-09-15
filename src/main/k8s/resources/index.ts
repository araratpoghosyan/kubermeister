import type { Kind } from '../../../shared/k8s/registry.js';
import type {
    DetailOf,
    ResourceGetInput,
    ResourceGetOutput,
    ResourceListInput,
    ResourceListOutput,
    RowOf,
} from '../../../shared/k8s/resources.js';
import { getConfigMap, getSecret, listConfigMaps, listSecrets } from './config.js';
import {
    getEndpoints,
    getIngress,
    getNetworkPolicy,
    getService,
    listEndpoints,
    listIngresses,
    listNetworkPolicies,
    listServices,
} from './network.js';
import {
    getClusterRole,
    getClusterRoleBinding,
    getRole,
    getRoleBinding,
    getServiceAccount,
    listClusterRoleBindings,
    listClusterRoles,
    listRoleBindings,
    listRoles,
    listServiceAccounts,
} from './access.js';
import { getPod, listPods } from './pods.js';
import {
    getClaim,
    getSnapshot,
    getStorageClass,
    getVolume,
    listClaims,
    listSnapshots,
    listStorageClasses,
    listVolumes,
} from './storage.js';
import {
    getAutoscaler,
    getCronJob,
    getDaemonSet,
    getDeployment,
    getJob,
    getStatefulSet,
    listAutoscalers,
    listCronJobs,
    listDaemonSets,
    listDeployments,
    listJobs,
    listStatefulSets,
} from './workloads.js';

/** Per-kind fetchers behind the generic channels. Adding a kind means one entry here. */
interface Source<K extends Kind> {
    list: (namespace?: string) => Promise<Array<RowOf<K>>>;
    get: (name: string, namespace?: string) => Promise<DetailOf<K> | null>;
}

const SOURCES: { [K in Kind]: Source<K> } = {
    Pod: { list: listPods, get: getPod },
    Deployment: { list: listDeployments, get: getDeployment },
    StatefulSet: { list: listStatefulSets, get: getStatefulSet },
    DaemonSet: { list: listDaemonSets, get: getDaemonSet },
    Job: { list: listJobs, get: getJob },
    CronJob: { list: listCronJobs, get: getCronJob },
    HorizontalPodAutoscaler: { list: listAutoscalers, get: getAutoscaler },
    ConfigMap: { list: listConfigMaps, get: getConfigMap },
    Secret: { list: listSecrets, get: getSecret },
    Service: { list: listServices, get: getService },
    Ingress: { list: listIngresses, get: getIngress },
    Endpoints: { list: listEndpoints, get: getEndpoints },
    NetworkPolicy: { list: listNetworkPolicies, get: getNetworkPolicy },
    PersistentVolume: { list: () => listVolumes(), get: (name) => getVolume(name) },
    PersistentVolumeClaim: { list: listClaims, get: getClaim },
    StorageClass: { list: () => listStorageClasses(), get: (name) => getStorageClass(name) },
    VolumeSnapshot: { list: listSnapshots, get: getSnapshot },
    ServiceAccount: { list: listServiceAccounts, get: getServiceAccount },
    Role: { list: listRoles, get: getRole },
    RoleBinding: { list: listRoleBindings, get: getRoleBinding },
    ClusterRole: { list: () => listClusterRoles(), get: (name) => getClusterRole(name) },
    ClusterRoleBinding: { list: () => listClusterRoleBindings(), get: (name) => getClusterRoleBinding(name) },
};

export async function listResources(input: ResourceListInput): Promise<ResourceListOutput> {
    switch (input.kind) {
        case 'Pod':
            return { kind: 'Pod', items: await SOURCES.Pod.list(input.namespace) };
        case 'Deployment':
            return { kind: 'Deployment', items: await SOURCES.Deployment.list(input.namespace) };
        case 'StatefulSet':
            return { kind: 'StatefulSet', items: await SOURCES.StatefulSet.list(input.namespace) };
        case 'DaemonSet':
            return { kind: 'DaemonSet', items: await SOURCES.DaemonSet.list(input.namespace) };
        case 'Job':
            return { kind: 'Job', items: await SOURCES.Job.list(input.namespace) };
        case 'CronJob':
            return { kind: 'CronJob', items: await SOURCES.CronJob.list(input.namespace) };
        case 'HorizontalPodAutoscaler':
            return {
                kind: 'HorizontalPodAutoscaler',
                items: await SOURCES.HorizontalPodAutoscaler.list(input.namespace),
            };
        case 'ConfigMap':
            return { kind: 'ConfigMap', items: await SOURCES.ConfigMap.list(input.namespace) };
        case 'Secret':
            return { kind: 'Secret', items: await SOURCES.Secret.list(input.namespace) };
        case 'Service':
            return { kind: 'Service', items: await SOURCES.Service.list(input.namespace) };
        case 'Ingress':
            return { kind: 'Ingress', items: await SOURCES.Ingress.list(input.namespace) };
        case 'Endpoints':
            return { kind: 'Endpoints', items: await SOURCES.Endpoints.list(input.namespace) };
        case 'NetworkPolicy':
            return { kind: 'NetworkPolicy', items: await SOURCES.NetworkPolicy.list(input.namespace) };
        case 'PersistentVolume':
            return { kind: 'PersistentVolume', items: await SOURCES.PersistentVolume.list() };
        case 'PersistentVolumeClaim':
            return { kind: 'PersistentVolumeClaim', items: await SOURCES.PersistentVolumeClaim.list(input.namespace) };
        case 'StorageClass':
            return { kind: 'StorageClass', items: await SOURCES.StorageClass.list() };
        case 'VolumeSnapshot':
            return { kind: 'VolumeSnapshot', items: await SOURCES.VolumeSnapshot.list(input.namespace) };
        case 'ServiceAccount':
            return { kind: 'ServiceAccount', items: await SOURCES.ServiceAccount.list(input.namespace) };
        case 'Role':
            return { kind: 'Role', items: await SOURCES.Role.list(input.namespace) };
        case 'RoleBinding':
            return { kind: 'RoleBinding', items: await SOURCES.RoleBinding.list(input.namespace) };
        case 'ClusterRole':
            return { kind: 'ClusterRole', items: await SOURCES.ClusterRole.list() };
        case 'ClusterRoleBinding':
            return { kind: 'ClusterRoleBinding', items: await SOURCES.ClusterRoleBinding.list() };
    }
}

export async function getResource(input: ResourceGetInput): Promise<ResourceGetOutput> {
    switch (input.kind) {
        case 'Pod':
            return { kind: 'Pod', item: await SOURCES.Pod.get(input.name, input.namespace) };
        case 'Deployment':
            return { kind: 'Deployment', item: await SOURCES.Deployment.get(input.name, input.namespace) };
        case 'StatefulSet':
            return { kind: 'StatefulSet', item: await SOURCES.StatefulSet.get(input.name, input.namespace) };
        case 'DaemonSet':
            return { kind: 'DaemonSet', item: await SOURCES.DaemonSet.get(input.name, input.namespace) };
        case 'Job':
            return { kind: 'Job', item: await SOURCES.Job.get(input.name, input.namespace) };
        case 'CronJob':
            return { kind: 'CronJob', item: await SOURCES.CronJob.get(input.name, input.namespace) };
        case 'HorizontalPodAutoscaler':
            return {
                kind: 'HorizontalPodAutoscaler',
                item: await SOURCES.HorizontalPodAutoscaler.get(input.name, input.namespace),
            };
        case 'ConfigMap':
            return { kind: 'ConfigMap', item: await SOURCES.ConfigMap.get(input.name, input.namespace) };
        case 'Secret':
            return { kind: 'Secret', item: await SOURCES.Secret.get(input.name, input.namespace) };
        case 'Service':
            return { kind: 'Service', item: await SOURCES.Service.get(input.name, input.namespace) };
        case 'Ingress':
            return { kind: 'Ingress', item: await SOURCES.Ingress.get(input.name, input.namespace) };
        case 'Endpoints':
            return { kind: 'Endpoints', item: await SOURCES.Endpoints.get(input.name, input.namespace) };
        case 'NetworkPolicy':
            return { kind: 'NetworkPolicy', item: await SOURCES.NetworkPolicy.get(input.name, input.namespace) };
        case 'PersistentVolume':
            return { kind: 'PersistentVolume', item: await SOURCES.PersistentVolume.get(input.name) };
        case 'PersistentVolumeClaim':
            return {
                kind: 'PersistentVolumeClaim',
                item: await SOURCES.PersistentVolumeClaim.get(input.name, input.namespace),
            };
        case 'StorageClass':
            return { kind: 'StorageClass', item: await SOURCES.StorageClass.get(input.name) };
        case 'VolumeSnapshot':
            return { kind: 'VolumeSnapshot', item: await SOURCES.VolumeSnapshot.get(input.name, input.namespace) };
        case 'ServiceAccount':
            return { kind: 'ServiceAccount', item: await SOURCES.ServiceAccount.get(input.name, input.namespace) };
        case 'Role':
            return { kind: 'Role', item: await SOURCES.Role.get(input.name, input.namespace) };
        case 'RoleBinding':
            return { kind: 'RoleBinding', item: await SOURCES.RoleBinding.get(input.name, input.namespace) };
        case 'ClusterRole':
            return { kind: 'ClusterRole', item: await SOURCES.ClusterRole.get(input.name) };
        case 'ClusterRoleBinding':
            return { kind: 'ClusterRoleBinding', item: await SOURCES.ClusterRoleBinding.get(input.name) };
    }
}
