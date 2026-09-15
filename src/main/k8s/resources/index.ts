import type { Kind } from '../../../shared/k8s/registry.js';
import type {
    DetailOf,
    ResourceGetInput,
    ResourceGetOutput,
    ResourceListInput,
    ResourceListOutput,
    RowOf,
} from '../../../shared/k8s/resources.js';
import { getPod, listPods } from './pods.js';
import {
    getDaemonSet,
    getDeployment,
    getStatefulSet,
    listDaemonSets,
    listDeployments,
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
    }
}
