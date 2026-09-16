import {
    makeInformer,
    type KubernetesObject,
    type V1ClusterRoleBinding,
    type V1CronJob,
    type V1CustomResourceDefinition,
    type V1CSIDriver,
    type V1CSINode,
    type V1CSIStorageCapacity,
    type V1IngressClass,
    type V1MutatingWebhookConfiguration,
    type V1ValidatingWebhookConfiguration,
    type V1PriorityClass,
    type V1RuntimeClass,
    type V1RoleBinding,
    type V1StorageClass,
    type V2HorizontalPodAutoscaler,
} from '@kubernetes/client-node';
import type { Kind } from '../../shared/k8s/registry.js';
import type { RowOf } from '../../shared/k8s/resources.js';
import { streamSchemas, type StreamController, type StreamSend, type WatchEvent } from '../../shared/streams.js';
import { apis, kubeConfig, resolveNamespace } from './client.js';
import { K8sError } from './errors.js';
import { toConfigMap, toSecret } from './resources/config.js';
import { toCustomResource } from './resources/crds.js';
import { toEndpoints, toIngress, toNetworkPolicy, toService } from './resources/network.js';
import { toClusterRole, toClusterRoleBinding, toRole, toRoleBinding, toServiceAccount } from './resources/access.js';
import { toPod, usageFor } from './resources/pods.js';
import { toAdmissionPolicy, toWebhookConfig } from './resources/admission.js';
import { toApiService, toFlowSchema } from './resources/apiserver.js';
import { toIngressClass, toRuntimeClass } from './resources/classes.js';
import { toCsiCapacity, toCsiDriver, toCsiNode } from './resources/csi.js';
import { toLease, toPodDisruptionBudget, toPriorityClass } from './resources/policy.js';
import { toClaim, toStorageClass, toVolume } from './resources/storage.js';
import {
    toAutoscaler,
    toCronJob,
    toDaemonSet,
    toDeployment,
    toJob,
    toReplicaSetRow,
    toReplicationController,
    toStatefulSet,
} from './resources/workloads.js';

/** How long to wait before restarting an informer after its watch connection failed. */
export const WATCH_RETRY_MS = 5_000;

interface WatchSource<K extends Kind> {
    path: (namespace: string | undefined) => string;
    /**
     * The list call behind both the one-shot read and the informer. A label selector is handed to
     * the API server here rather than filtered afterwards, so the watch narrows with the list.
     */
    list: (namespace: string | undefined, labelSelector?: string) => () => Promise<{ items: KubernetesObject[] }>;
    toRow: (object: KubernetesObject) => RowOf<K>;
}

/**
 * Same transforms as the list readers, so a watched row and a listed row are identical. Kinds
 * without an entry (the snapshot CRD, which a cluster need not have) are polled instead.
 */
const WATCH_SOURCES: { [K in Kind]?: WatchSource<K> } = {
    Pod: {
        path: (ns) => (ns ? `/api/v1/namespaces/${encodeURIComponent(ns)}/pods` : '/api/v1/pods'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedPod({ namespace: ns, labelSelector })
                : () => apis().core.listPodForAllNamespaces({ labelSelector }),
        toRow: (pod) => toPod(pod, Date.now(), usageFor(pod)),
    },
    Deployment: {
        path: (ns) =>
            ns ? `/apis/apps/v1/namespaces/${encodeURIComponent(ns)}/deployments` : '/apis/apps/v1/deployments',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().apps.listNamespacedDeployment({ namespace: ns, labelSelector })
                : () => apis().apps.listDeploymentForAllNamespaces({ labelSelector }),
        toRow: (d) => toDeployment(d),
    },
    StatefulSet: {
        path: (ns) =>
            ns ? `/apis/apps/v1/namespaces/${encodeURIComponent(ns)}/statefulsets` : '/apis/apps/v1/statefulsets',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().apps.listNamespacedStatefulSet({ namespace: ns, labelSelector })
                : () => apis().apps.listStatefulSetForAllNamespaces({ labelSelector }),
        toRow: (s) => toStatefulSet(s),
    },
    DaemonSet: {
        path: (ns) =>
            ns ? `/apis/apps/v1/namespaces/${encodeURIComponent(ns)}/daemonsets` : '/apis/apps/v1/daemonsets',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().apps.listNamespacedDaemonSet({ namespace: ns, labelSelector })
                : () => apis().apps.listDaemonSetForAllNamespaces({ labelSelector }),
        toRow: (d) => toDaemonSet(d),
    },
    ReplicaSet: {
        path: (ns) =>
            ns ? `/apis/apps/v1/namespaces/${encodeURIComponent(ns)}/replicasets` : '/apis/apps/v1/replicasets',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().apps.listNamespacedReplicaSet({ namespace: ns, labelSelector })
                : () => apis().apps.listReplicaSetForAllNamespaces({ labelSelector }),
        toRow: (rs) => toReplicaSetRow(rs),
    },
    ReplicationController: {
        path: (ns) =>
            ns
                ? `/api/v1/namespaces/${encodeURIComponent(ns)}/replicationcontrollers`
                : '/api/v1/replicationcontrollers',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedReplicationController({ namespace: ns, labelSelector })
                : () => apis().core.listReplicationControllerForAllNamespaces({ labelSelector }),
        toRow: (rc) => toReplicationController(rc),
    },
    Job: {
        path: (ns) => (ns ? `/apis/batch/v1/namespaces/${encodeURIComponent(ns)}/jobs` : '/apis/batch/v1/jobs'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().batch.listNamespacedJob({ namespace: ns, labelSelector })
                : () => apis().batch.listJobForAllNamespaces({ labelSelector }),
        toRow: (job) => toJob(job),
    },
    CronJob: {
        path: (ns) => (ns ? `/apis/batch/v1/namespaces/${encodeURIComponent(ns)}/cronjobs` : '/apis/batch/v1/cronjobs'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().batch.listNamespacedCronJob({ namespace: ns, labelSelector })
                : () => apis().batch.listCronJobForAllNamespaces({ labelSelector }),
        // The client's own types require `spec` on these two; the informer hands over the generic
        // object type, and the transforms read every field defensively.
        toRow: (cronJob) => toCronJob(cronJob as V1CronJob),
    },
    HorizontalPodAutoscaler: {
        path: (ns) =>
            ns
                ? `/apis/autoscaling/v2/namespaces/${encodeURIComponent(ns)}/horizontalpodautoscalers`
                : '/apis/autoscaling/v2/horizontalpodautoscalers',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().hpa.listNamespacedHorizontalPodAutoscaler({ namespace: ns, labelSelector })
                : () => apis().hpa.listHorizontalPodAutoscalerForAllNamespaces({ labelSelector }),
        toRow: (autoscaler) => toAutoscaler(autoscaler as V2HorizontalPodAutoscaler),
    },
    PodDisruptionBudget: {
        path: (ns) =>
            ns
                ? `/apis/policy/v1/namespaces/${encodeURIComponent(ns)}/poddisruptionbudgets`
                : '/apis/policy/v1/poddisruptionbudgets',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().policy.listNamespacedPodDisruptionBudget({ namespace: ns, labelSelector })
                : () => apis().policy.listPodDisruptionBudgetForAllNamespaces({ labelSelector }),
        toRow: (pdb) => toPodDisruptionBudget(pdb),
    },
    PriorityClass: {
        path: () => '/apis/scheduling.k8s.io/v1/priorityclasses',
        list: (_ns, labelSelector) => () => apis().scheduling.listPriorityClass({ labelSelector }),
        // A PriorityClass keeps `value` at the top level, which the generic object type omits.
        toRow: (priorityClass) => toPriorityClass(priorityClass as V1PriorityClass),
    },
    Lease: {
        path: (ns) =>
            ns
                ? `/apis/coordination.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/leases`
                : '/apis/coordination.k8s.io/v1/leases',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().coordination.listNamespacedLease({ namespace: ns, labelSelector })
                : () => apis().coordination.listLeaseForAllNamespaces({ labelSelector }),
        toRow: (lease) => toLease(lease),
    },
    RuntimeClass: {
        path: () => '/apis/node.k8s.io/v1/runtimeclasses',
        list: (_ns, labelSelector) => () => apis().runtime.listRuntimeClass({ labelSelector }),
        // A RuntimeClass carries `handler` at the top level, which the generic object type omits.
        toRow: (runtimeClass) => toRuntimeClass(runtimeClass as V1RuntimeClass),
    },
    ConfigMap: {
        path: (ns) => (ns ? `/api/v1/namespaces/${encodeURIComponent(ns)}/configmaps` : '/api/v1/configmaps'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedConfigMap({ namespace: ns, labelSelector })
                : () => apis().core.listConfigMapForAllNamespaces({ labelSelector }),
        toRow: (configMap) => toConfigMap(configMap),
    },
    Secret: {
        path: (ns) => (ns ? `/api/v1/namespaces/${encodeURIComponent(ns)}/secrets` : '/api/v1/secrets'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedSecret({ namespace: ns, labelSelector })
                : () => apis().core.listSecretForAllNamespaces({ labelSelector }),
        toRow: (secret) => toSecret(secret),
    },
    Service: {
        path: (ns) => (ns ? `/api/v1/namespaces/${encodeURIComponent(ns)}/services` : '/api/v1/services'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedService({ namespace: ns, labelSelector })
                : () => apis().core.listServiceForAllNamespaces({ labelSelector }),
        toRow: (service) => toService(service),
    },
    Ingress: {
        path: (ns) =>
            ns
                ? `/apis/networking.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/ingresses`
                : '/apis/networking.k8s.io/v1/ingresses',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().net.listNamespacedIngress({ namespace: ns, labelSelector })
                : () => apis().net.listIngressForAllNamespaces({ labelSelector }),
        toRow: (ingress) => toIngress(ingress),
    },
    Endpoints: {
        path: (ns) => (ns ? `/api/v1/namespaces/${encodeURIComponent(ns)}/endpoints` : '/api/v1/endpoints'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedEndpoints({ namespace: ns, labelSelector })
                : () => apis().core.listEndpointsForAllNamespaces({ labelSelector }),
        toRow: (endpoints) => toEndpoints(endpoints),
    },
    NetworkPolicy: {
        path: (ns) =>
            ns
                ? `/apis/networking.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/networkpolicies`
                : '/apis/networking.k8s.io/v1/networkpolicies',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().net.listNamespacedNetworkPolicy({ namespace: ns, labelSelector })
                : () => apis().net.listNetworkPolicyForAllNamespaces({ labelSelector }),
        toRow: (policy) => toNetworkPolicy(policy),
    },
    IngressClass: {
        path: () => '/apis/networking.k8s.io/v1/ingressclasses',
        list: (_ns, labelSelector) => () => apis().net.listIngressClass({ labelSelector }),
        toRow: (ingressClass) => toIngressClass(ingressClass as V1IngressClass),
    },
    CSIDriver: {
        path: () => '/apis/storage.k8s.io/v1/csidrivers',
        list: (_ns, labelSelector) => () => apis().storage.listCSIDriver({ labelSelector }),
        // The client's types require `spec` here; the informer hands over the generic object type
        // and the transforms read every field defensively.
        toRow: (driver) => toCsiDriver(driver as V1CSIDriver),
    },
    CSINode: {
        path: () => '/apis/storage.k8s.io/v1/csinodes',
        list: (_ns, labelSelector) => () => apis().storage.listCSINode({ labelSelector }),
        toRow: (node) => toCsiNode(node as V1CSINode),
    },
    CSIStorageCapacity: {
        path: (ns) =>
            ns
                ? `/apis/storage.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/csistoragecapacities`
                : '/apis/storage.k8s.io/v1/csistoragecapacities',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().storage.listNamespacedCSIStorageCapacity({ namespace: ns, labelSelector })
                : () => apis().storage.listCSIStorageCapacityForAllNamespaces({ labelSelector }),
        toRow: (capacity) => toCsiCapacity(capacity as V1CSIStorageCapacity),
    },
    PersistentVolume: {
        path: () => '/api/v1/persistentvolumes',
        list: (_ns, labelSelector) => () => apis().core.listPersistentVolume({ labelSelector }),
        toRow: (volume) => toVolume(volume),
    },
    PersistentVolumeClaim: {
        path: (ns) =>
            ns
                ? `/api/v1/namespaces/${encodeURIComponent(ns)}/persistentvolumeclaims`
                : '/api/v1/persistentvolumeclaims',
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedPersistentVolumeClaim({ namespace: ns, labelSelector })
                : () => apis().core.listPersistentVolumeClaimForAllNamespaces({ labelSelector }),
        toRow: (claim) => toClaim(claim),
    },
    ServiceAccount: {
        path: (ns) => (ns ? `/api/v1/namespaces/${encodeURIComponent(ns)}/serviceaccounts` : '/api/v1/serviceaccounts'),
        list: (ns, labelSelector) =>
            ns
                ? () => apis().core.listNamespacedServiceAccount({ namespace: ns, labelSelector })
                : () => apis().core.listServiceAccountForAllNamespaces({ labelSelector }),
        toRow: (account) => toServiceAccount(account),
    },
    Role: {
        path: (ns) =>
            ns
                ? `/apis/rbac.authorization.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/roles`
                : `/apis/rbac.authorization.k8s.io/v1/roles`,
        list: (ns, labelSelector) =>
            ns
                ? () => apis().rbac.listNamespacedRole({ namespace: ns, labelSelector })
                : () => apis().rbac.listRoleForAllNamespaces({ labelSelector }),
        toRow: (role) => toRole(role),
    },
    RoleBinding: {
        path: (ns) =>
            ns
                ? `/apis/rbac.authorization.k8s.io/v1/namespaces/${encodeURIComponent(ns)}/rolebindings`
                : `/apis/rbac.authorization.k8s.io/v1/rolebindings`,
        list: (ns, labelSelector) =>
            ns
                ? () => apis().rbac.listNamespacedRoleBinding({ namespace: ns, labelSelector })
                : () => apis().rbac.listRoleBindingForAllNamespaces({ labelSelector }),
        toRow: (binding) => toRoleBinding(binding as V1RoleBinding),
    },
    ClusterRole: {
        path: () => `/apis/rbac.authorization.k8s.io/v1/clusterroles`,
        list: (_ns, labelSelector) => () => apis().rbac.listClusterRole({ labelSelector }),
        toRow: (role) => toClusterRole(role),
    },
    ClusterRoleBinding: {
        path: () => `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`,
        list: (_ns, labelSelector) => () => apis().rbac.listClusterRoleBinding({ labelSelector }),
        toRow: (binding) => toClusterRoleBinding(binding as V1ClusterRoleBinding),
    },
    MutatingWebhookConfiguration: {
        path: () => '/apis/admissionregistration.k8s.io/v1/mutatingwebhookconfigurations',
        list: (_ns, labelSelector) => () => apis().admission.listMutatingWebhookConfiguration({ labelSelector }),
        toRow: (configuration) => toWebhookConfig(configuration as V1MutatingWebhookConfiguration),
    },
    ValidatingWebhookConfiguration: {
        path: () => '/apis/admissionregistration.k8s.io/v1/validatingwebhookconfigurations',
        list: (_ns, labelSelector) => () => apis().admission.listValidatingWebhookConfiguration({ labelSelector }),
        toRow: (configuration) => toWebhookConfig(configuration as V1ValidatingWebhookConfiguration),
    },
    ValidatingAdmissionPolicy: {
        path: () => '/apis/admissionregistration.k8s.io/v1/validatingadmissionpolicies',
        list: (_ns, labelSelector) => () => apis().admission.listValidatingAdmissionPolicy({ labelSelector }),
        toRow: (policy) => toAdmissionPolicy(policy),
    },
    APIService: {
        path: () => '/apis/apiregistration.k8s.io/v1/apiservices',
        list: (_ns, labelSelector) => () => apis().apiregistration.listAPIService({ labelSelector }),
        toRow: (service) => toApiService(service),
    },
    FlowSchema: {
        path: () => '/apis/flowcontrol.apiserver.k8s.io/v1/flowschemas',
        list: (_ns, labelSelector) => () => apis().flowcontrol.listFlowSchema({ labelSelector }),
        toRow: (schema) => toFlowSchema(schema),
    },
    CustomResourceDefinition: {
        path: () => '/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        list: (_ns, labelSelector) => () => apis().apiextensions.listCustomResourceDefinition({ labelSelector }),
        toRow: (crd) => toCustomResource(crd as V1CustomResourceDefinition),
    },
    StorageClass: {
        path: () => '/apis/storage.k8s.io/v1/storageclasses',
        list: (_ns, labelSelector) => () => apis().storage.listStorageClass({ labelSelector }),
        // A StorageClass carries `provisioner` at the top level, which the generic object type omits.
        toRow: (storageClass) => toStorageClass(storageClass as V1StorageClass),
    },
};

/**
 * A filtered list of one kind, through the very same call the informer lists with. Filtering is the
 * API server's job — the app never fetches rows only to drop them — and reusing the watch source
 * means a filtered list and the watch behind it cannot disagree about what a row looks like.
 */
export async function listFiltered(
    kind: Kind,
    namespace: string | undefined,
    labelSelector: string,
): Promise<RowOf<Kind>[]> {
    const source = WATCH_SOURCES[kind] as WatchSource<Kind> | undefined;
    if (!source) throw new K8sError('invalid', `${kind} cannot be filtered by label`, 'resources.list');
    const { items } = await source.list(resolveNamespace(namespace), labelSelector)();
    return items.map((object) => source.toRow(object));
}

/**
 * Watch one kind in the explicit, active or all namespaces through the client's informer, which
 * lists first (replayed as `added`) and then follows the watch, reconnecting on its own. A failed
 * connection is reported and retried after a pause until the stream is stopped.
 */
/** One informer, shared by every stream watching the same kind in the same namespace. */
interface Shared {
    informer: ReturnType<typeof makeInformer>;
    subscribers: Set<(event: WatchEvent) => void>;
    /** Latest cache, replayed to a screen that arrives after the first list. */
    cached: () => readonly KubernetesObject[];
    toRow: WatchSource<Kind>['toRow'];
    kind: Kind;
    retry?: NodeJS.Timeout;
    failed?: string;
}

const shared = new Map<string, Shared>();

// Two screens filtering differently are watching different things, so the selector is part of the key.
const watchKey = (kind: Kind, namespace: string | undefined, labelSelector: string | undefined): string =>
    `${kind}/${namespace ?? '*'}/${labelSelector ?? ''}`;

/**
 * The informer for one kind and namespace, started once however many screens are watching. Two
 * screens on the same list used to mean two watch connections and two full lists of the same
 * objects; now the second one replays what the first already has and the API server sees one watch.
 */
function acquire(
    kind: Kind,
    namespace: string | undefined,
    source: WatchSource<Kind>,
    labelSelector: string | undefined,
): Shared {
    const key = watchKey(kind, namespace, labelSelector);
    const existing = shared.get(key);
    if (existing) return existing;

    const informer = makeInformer(
        kubeConfig(),
        source.path(namespace),
        source.list(namespace, labelSelector),
        labelSelector,
    );
    const entry: Shared = {
        informer,
        subscribers: new Set(),
        cached: () => informer.list(),
        toRow: source.toRow,
        kind,
    };

    const fan = (type: WatchEvent['type']) => (object: KubernetesObject) => {
        const event = { kind, type, item: source.toRow(object) } as WatchEvent;
        for (const send of entry.subscribers) send(event);
    };
    informer.on('add', fan('added'));
    informer.on('update', fan('modified'));
    informer.on('delete', fan('deleted'));
    informer.on('error', (error: unknown) => {
        entry.failed = error instanceof Error ? error.message : String(error);
        for (const send of entry.subscribers) send({ kind, type: 'error' } as never);
        entry.retry = setTimeout(() => {
            if (shared.get(key) === entry) void informer.start();
        }, WATCH_RETRY_MS);
    });

    shared.set(key, entry);
    return entry;
}

/** Drop one subscriber, and the informer itself once nobody is left watching. */
function release(
    kind: Kind,
    namespace: string | undefined,
    labelSelector: string | undefined,
    subscriber: (event: WatchEvent) => void,
): void {
    const key = watchKey(kind, namespace, labelSelector);
    const entry = shared.get(key);
    if (!entry) return;
    entry.subscribers.delete(subscriber);
    if (entry.subscribers.size > 0) return;
    if (entry.retry) clearTimeout(entry.retry);
    shared.delete(key);
    void entry.informer.stop();
}

/** Stop every informer: the connection they were made on is going away. */
export function stopAllInformers(): void {
    for (const [key, entry] of [...shared.entries()]) {
        if (entry.retry) clearTimeout(entry.retry);
        shared.delete(key);
        void entry.informer.stop();
    }
}

/** How many informers are open, for tests and for reasoning about what a screen costs. */
export const openInformerCount = (): number => shared.size;

export async function startResourceWatch(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['resources.watch'].parse(rawInput);
    const namespace = resolveNamespace(input.namespace);
    const source = WATCH_SOURCES[input.kind] as WatchSource<Kind> | undefined;
    if (!source) throw new K8sError('invalid', `${input.kind} is not watchable`, 'resources.watch');

    const entry = acquire(input.kind, namespace, source, input.labelSelector);
    let active = true;
    const subscriber = (event: WatchEvent) => {
        if (!active) return;
        // The shared informer reports a failure once; each subscriber hears it in its own stream.
        if ((event as { type: string }).type === 'error') {
            send({ type: 'error', message: entry.failed ?? 'the watch failed' });
            return;
        }
        send({ type: 'data', data: event });
    };
    entry.subscribers.add(subscriber);

    const first = entry.subscribers.size === 1;
    if (first) {
        await entry.informer.start();
    } else {
        // A screen arriving second must not wait for a fresh list: replay what is already cached,
        // which is exactly the sequence a new informer would have sent it.
        for (const object of entry.cached()) {
            subscriber({ kind: input.kind, type: 'added', item: entry.toRow(object) } as WatchEvent);
        }
    }

    return {
        stop: () => {
            active = false;
            release(input.kind, namespace, input.labelSelector, subscriber);
        },
    };
}
