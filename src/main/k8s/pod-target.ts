import { apis } from './client.js';
import { readOrNull } from './client.js';
import type { StreamController, StreamSend } from '../../shared/streams.js';

export interface PodTarget {
    name: string;
    namespace: string;
    container: string;
}

/**
 * Resolve the container a pod stream addresses: the requested one when given, else the pod's
 * first. Null when the pod does not exist, which the caller reports as a stream error.
 */
export async function resolvePodTarget(name: string, namespace: string, container?: string): Promise<PodTarget | null> {
    const pod = await readOrNull(() => apis().core.readNamespacedPod({ name, namespace }));
    if (!pod) return null;
    const containers = pod.spec?.containers?.map((c) => c.name) ?? [];
    const chosen = container ?? containers[0];
    if (!chosen || (container && !containers.includes(container))) return null;
    return { name, namespace, container: chosen };
}

/** The controller a stream returns when it could not even start. */
export const NOOP_CONTROLLER: StreamController = { stop: () => {} };

export function reportMissingPod(
    send: StreamSend,
    name: string,
    namespace: string,
    container?: string,
): StreamController {
    const what = container ? `container "${container}" of pod "${namespace}/${name}"` : `pod "${namespace}/${name}"`;
    send({ type: 'error', message: `${what} not found` });
    send({ type: 'end' });
    return NOOP_CONTROLLER;
}
