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
import { getPod, listPods } from './pods.js';
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
    }
}
