import { makeInformer, type KubernetesObject, type V1Pod } from '@kubernetes/client-node';
import type { Kind } from '../../shared/k8s/registry.js';
import type { RowOf } from '../../shared/k8s/resources.js';
import { streamSchemas, type StreamController, type StreamSend, type WatchEventOf } from '../../shared/streams.js';
import { apis, kubeConfig, resolveNamespace } from './client.js';
import { toPod, usageFor } from './resources/pods.js';

/** How long to wait before restarting an informer after its watch connection failed. */
export const WATCH_RETRY_MS = 5_000;

interface WatchSource<K extends Kind, T extends KubernetesObject> {
    path: (namespace: string | undefined) => string;
    list: (namespace: string | undefined) => () => Promise<{ items: T[] }>;
    toRow: (object: T) => RowOf<K>;
}

/** Same transforms as the list readers, so a watched row and a listed row are identical. */
const WATCH_SOURCES: { Pod: WatchSource<'Pod', V1Pod> } = {
    Pod: {
        path: (ns) => (ns ? `/api/v1/namespaces/${ns}/pods` : '/api/v1/pods'),
        list: (ns) =>
            ns ? () => apis().core.listNamespacedPod({ namespace: ns }) : () => apis().core.listPodForAllNamespaces(),
        toRow: (pod) => toPod(pod, Date.now(), usageFor(pod)),
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
    const source = WATCH_SOURCES[input.kind];
    const informer = makeInformer(kubeConfig(), source.path(namespace), source.list(namespace));

    let active = true;
    let retry: NodeJS.Timeout | undefined;
    const emit = (type: WatchEventOf<'Pod'>['type']) => (object: V1Pod) => {
        if (active) send({ type: 'data', data: { kind: 'Pod', type, item: source.toRow(object) } });
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
