import { makeInformer, type KubernetesObject } from '@kubernetes/client-node';
import type { Kind } from '../../shared/k8s/registry.js';
import type { RowOf } from '../../shared/k8s/resources.js';
import { streamSchemas, type StreamController, type StreamSend, type WatchEvent } from '../../shared/streams.js';
import { apis, kubeConfig, resolveNamespace } from './client.js';
import { toPod, usageFor } from './resources/pods.js';
import { toDaemonSet, toDeployment, toStatefulSet } from './resources/workloads.js';

/** How long to wait before restarting an informer after its watch connection failed. */
export const WATCH_RETRY_MS = 5_000;

interface WatchSource<K extends Kind> {
    path: (namespace: string | undefined) => string;
    list: (namespace: string | undefined) => () => Promise<{ items: KubernetesObject[] }>;
    toRow: (object: KubernetesObject) => RowOf<K>;
}

/** Same transforms as the list readers, so a watched row and a listed row are identical. */
const WATCH_SOURCES: { [K in Kind]: WatchSource<K> } = {
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
};

/**
 * Watch one kind in the explicit, active or all namespaces through the client's informer, which
 * lists first (replayed as `added`) and then follows the watch, reconnecting on its own. A failed
 * connection is reported and retried after a pause until the stream is stopped.
 */
export async function startResourceWatch(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['resources.watch'].parse(rawInput);
    const namespace = resolveNamespace(input.namespace);
    const source = WATCH_SOURCES[input.kind] as WatchSource<Kind>;
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
