import {
    makeInformer,
    type KubernetesObject,
    type V1ClusterRoleBinding,
    type V1CustomResourceDefinition,
    type V1RoleBinding,
    type V1StorageClass,
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
import { toClaim, toStorageClass, toVolume } from './resources/storage.js';
import { toAutoscaler, toCronJob, toDaemonSet, toDeployment, toJob, toStatefulSet } from './resources/workloads.js';

/** How long to wait before restarting an informer after its watch connection failed. */
export const WATCH_RETRY_MS = 5_000;

interface WatchSource<K extends Kind> {
    path: (namespace: string | undefined) => string;
    list: (namespace: string | undefined) => () => Promise<{ items: KubernetesObject[] }>;
    toRow: (object: KubernetesObject) => RowOf<K>;
}

/**
 * Same transforms as the list readers, so a watched row and a listed row are identical. Kinds
 * without an entry (the snapshot CRD, which a cluster need not have) are polled instead.
 */
const WATCH_SOURCES: { [K in Kind]?: WatchSource<K> } = {
    Pod: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/pods` : '/api/v1/pods'),
        list: (ns) =>
            ns ? () => apis().core.listNamespacedPod({ namespace: ns }) : () => apis().core.listPodForAllNamespaces(),
        toRow: (pod) => toPod(pod, Date.now(), usageFor(pod)),
    },
    Deployment: {
        path: (ns) => (ns ? `/apis/apps/v1/namespaces/${ns}/deployments` : '/apis/apps/v1/deployments'),
        list: (ns) =>
            ns
                ? () => apis().apps.listNamespacedDeployment({ namespace: ns })
                : () => apis().apps.listDeploymentForAllNamespaces(),
        toRow: (d) => toDeployment(d),
    },
    StatefulSet: {
        path: (ns) => (ns ? `/apis/apps/v1/namespaces/${ns}/statefulsets` : '/apis/apps/v1/statefulsets'),
        list: (ns) =>
            ns
                ? () => apis().apps.listNamespacedStatefulSet({ namespace: ns })
                : () => apis().apps.listStatefulSetForAllNamespaces(),
        toRow: (s) => toStatefulSet(s),
    },
    DaemonSet: {
        path: (ns) => (ns ? `/apis/apps/v1/namespaces/${ns}/daemonsets` : '/apis/apps/v1/daemonsets'),
        list: (ns) =>
            ns
                ? () => apis().apps.listNamespacedDaemonSet({ namespace: ns })
                : () => apis().apps.listDaemonSetForAllNamespaces(),
        toRow: (d) => toDaemonSet(d),
    },
    Job: {
        path: (ns) => (ns ? `/apis/batch/v1/namespaces/${ns}/jobs` : '/apis/batch/v1/jobs'),
        list: (ns) =>
            ns ? () => apis().batch.listNamespacedJob({ namespace: ns }) : () => apis().batch.listJobForAllNamespaces(),
        toRow: (job) => toJob(job),
    },
    CronJob: {
        path: (ns) => (ns ? `/apis/batch/v1/namespaces/${ns}/cronjobs` : '/apis/batch/v1/cronjobs'),
        list: (ns) =>
            ns
                ? () => apis().batch.listNamespacedCronJob({ namespace: ns })
                : () => apis().batch.listCronJobForAllNamespaces(),
        toRow: (cronJob) => toCronJob(cronJob),
    },
    HorizontalPodAutoscaler: {
        path: (ns) =>
            ns
                ? `/apis/autoscaling/v2/namespaces/${ns}/horizontalpodautoscalers`
                : '/apis/autoscaling/v2/horizontalpodautoscalers',
        list: (ns) =>
            ns
                ? () => apis().hpa.listNamespacedHorizontalPodAutoscaler({ namespace: ns })
                : () => apis().hpa.listHorizontalPodAutoscalerForAllNamespaces(),
        toRow: (autoscaler) => toAutoscaler(autoscaler),
    },
    ConfigMap: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/configmaps` : '/api/v1/configmaps'),
        list: (ns) =>
            ns
                ? () => apis().core.listNamespacedConfigMap({ namespace: ns })
                : () => apis().core.listConfigMapForAllNamespaces(),
        toRow: (configMap) => toConfigMap(configMap),
    },
    Secret: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/secrets` : '/api/v1/secrets'),
        list: (ns) =>
            ns
                ? () => apis().core.listNamespacedSecret({ namespace: ns })
                : () => apis().core.listSecretForAllNamespaces(),
        toRow: (secret) => toSecret(secret),
    },
    Service: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/services` : '/api/v1/services'),
        list: (ns) =>
            ns
                ? () => apis().core.listNamespacedService({ namespace: ns })
                : () => apis().core.listServiceForAllNamespaces(),
        toRow: (service) => toService(service),
    },
    Ingress: {
        path: (ns) =>
            ns ? `/apis/networking.k8s.io/v1/namespaces/${ns}/ingresses` : '/apis/networking.k8s.io/v1/ingresses',
        list: (ns) =>
            ns
                ? () => apis().net.listNamespacedIngress({ namespace: ns })
                : () => apis().net.listIngressForAllNamespaces(),
        toRow: (ingress) => toIngress(ingress),
    },
    Endpoints: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/endpoints` : '/api/v1/endpoints'),
        list: (ns) =>
            ns
                ? () => apis().core.listNamespacedEndpoints({ namespace: ns })
                : () => apis().core.listEndpointsForAllNamespaces(),
        toRow: (endpoints) => toEndpoints(endpoints),
    },
    NetworkPolicy: {
        path: (ns) =>
            ns
                ? `/apis/networking.k8s.io/v1/namespaces/${ns}/networkpolicies`
                : '/apis/networking.k8s.io/v1/networkpolicies',
        list: (ns) =>
            ns
                ? () => apis().net.listNamespacedNetworkPolicy({ namespace: ns })
                : () => apis().net.listNetworkPolicyForAllNamespaces(),
        toRow: (policy) => toNetworkPolicy(policy),
    },
    PersistentVolume: {
        path: () => '/api/v1/persistentvolumes',
        list: () => () => apis().core.listPersistentVolume(),
        toRow: (volume) => toVolume(volume),
    },
    PersistentVolumeClaim: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/persistentvolumeclaims` : '/api/v1/persistentvolumeclaims'),
        list: (ns) =>
            ns
                ? () => apis().core.listNamespacedPersistentVolumeClaim({ namespace: ns })
                : () => apis().core.listPersistentVolumeClaimForAllNamespaces(),
        toRow: (claim) => toClaim(claim),
    },
    ServiceAccount: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/serviceaccounts` : '/api/v1/serviceaccounts'),
        list: (ns) =>
            ns
                ? () => apis().core.listNamespacedServiceAccount({ namespace: ns })
                : () => apis().core.listServiceAccountForAllNamespaces(),
        toRow: (account) => toServiceAccount(account),
    },
    Role: {
        path: (ns) =>
            ns
                ? `/apis/rbac.authorization.k8s.io/v1/namespaces/${ns}/roles`
                : `/apis/rbac.authorization.k8s.io/v1/roles`,
        list: (ns) =>
            ns ? () => apis().rbac.listNamespacedRole({ namespace: ns }) : () => apis().rbac.listRoleForAllNamespaces(),
        toRow: (role) => toRole(role),
    },
    RoleBinding: {
        path: (ns) =>
            ns
                ? `/apis/rbac.authorization.k8s.io/v1/namespaces/${ns}/rolebindings`
                : `/apis/rbac.authorization.k8s.io/v1/rolebindings`,
        list: (ns) =>
            ns
                ? () => apis().rbac.listNamespacedRoleBinding({ namespace: ns })
                : () => apis().rbac.listRoleBindingForAllNamespaces(),
        toRow: (binding) => toRoleBinding(binding as V1RoleBinding),
    },
    ClusterRole: {
        path: () => `/apis/rbac.authorization.k8s.io/v1/clusterroles`,
        list: () => () => apis().rbac.listClusterRole(),
        toRow: (role) => toClusterRole(role),
    },
    ClusterRoleBinding: {
        path: () => `/apis/rbac.authorization.k8s.io/v1/clusterrolebindings`,
        list: () => () => apis().rbac.listClusterRoleBinding(),
        toRow: (binding) => toClusterRoleBinding(binding as V1ClusterRoleBinding),
    },
    CustomResourceDefinition: {
        path: () => '/apis/apiextensions.k8s.io/v1/customresourcedefinitions',
        list: () => () => apis().apiextensions.listCustomResourceDefinition(),
        toRow: (crd) => toCustomResource(crd as V1CustomResourceDefinition),
    },
    StorageClass: {
        path: () => '/apis/storage.k8s.io/v1/storageclasses',
        list: () => () => apis().storage.listStorageClass(),
        // A StorageClass carries `provisioner` at the top level, which the generic object type omits.
        toRow: (storageClass) => toStorageClass(storageClass as V1StorageClass),
    },
};

/**
 * Watch one kind in the explicit, active or all namespaces through the client's informer, which
 * lists first (replayed as `added`) and then follows the watch, reconnecting on its own. A failed
 * connection is reported and retried after a pause until the stream is stopped.
 */
export async function startResourceWatch(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['resources.watch'].parse(rawInput);
    const namespace = resolveNamespace(input.namespace);
    const source = WATCH_SOURCES[input.kind] as WatchSource<Kind> | undefined;
    if (!source) throw new K8sError('invalid', `${input.kind} is not watchable`, 'resources.watch');
    const informer = makeInformer(kubeConfig(), source.path(namespace), source.list(namespace));

    let active = true;
    let retry: NodeJS.Timeout | undefined;
    const emit = (type: WatchEvent['type']) => (object: KubernetesObject) => {
        if (active) send({ type: 'data', data: { kind: input.kind, type, item: source.toRow(object) } as WatchEvent });
    };
    informer.on('add', emit('added'));
    informer.on('update', emit('modified'));
    informer.on('delete', emit('deleted'));
    informer.on('error', (error: unknown) => {
        if (!active) return;
        send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
        retry = setTimeout(() => {
            if (active) void informer.start();
        }, WATCH_RETRY_MS);
    });

    await informer.start();
    return {
        stop: () => {
            active = false;
            if (retry) clearTimeout(retry);
            void informer.stop();
        },
    };
}
