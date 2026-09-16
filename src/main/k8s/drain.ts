import type { KubernetesObject, V1Pod } from '@kubernetes/client-node';
import { ApiException } from '@kubernetes/client-node';
import type { DrainOptions, DrainPlan, DrainPod, DrainSkip } from '../../shared/k8s/drain.js';
import { streamSchemas, type StreamController, type StreamSend } from '../../shared/streams.js';
import { assertContext } from './resources/write.js';
import { apis } from './client.js';
import { K8sError, withK8s } from './errors.js';

/*
 * Draining a node: cordon it, then evict everything on it that something will put back somewhere
 * else. The eviction API is what honours PodDisruptionBudgets — it refuses with 429 while a budget
 * would be violated — so a drain is a patient loop, not a burst of deletes.
 */

/** A pod the kubelet runs from a file on the node; the API object is a mirror with no controller. */
const MIRROR_ANNOTATION = 'kubernetes.io/config.mirror';

/** How long to keep retrying one pod a disruption budget is holding back. */
const EVICTION_TIMEOUT_MS = 2 * 60 * 1000;
/** Wait between attempts at a pod a budget is holding back. */
const RETRY_DELAY_MS = 5_000;

export const podRef = (pod: V1Pod): DrainPod => ({
    name: pod.metadata?.name ?? '',
    namespace: pod.metadata?.namespace ?? '',
});

/**
 * Why this pod stays where it is, or null when it should be evicted. The order matters: a daemon
 * set pod that also uses an emptyDir reads as a daemon set pod, which is the reason the user can
 * act on.
 */
export function skipReason(pod: V1Pod, options: DrainOptions): DrainSkip | null {
    const phase = pod.status?.phase;
    if (phase === 'Succeeded' || phase === 'Failed') return 'finished';
    if (pod.metadata?.annotations?.[MIRROR_ANNOTATION]) return 'static';
    const owner = pod.metadata?.ownerReferences?.[0];
    if (owner?.kind === 'DaemonSet') return 'daemonSet';
    if (!owner && !options.force) return 'unmanaged';
    const usesEmptyDir = (pod.spec?.volumes ?? []).some((volume) => volume.emptyDir);
    if (usesEmptyDir && !options.deleteEmptyDirData) return 'emptyDir';
    return null;
}

/** Split the pods on a node into the ones a drain evicts and the ones it leaves, with reasons. */
export function planFor(pods: V1Pod[], options: DrainOptions): DrainPlan {
    const plan: DrainPlan = { evict: [], skip: [] };
    for (const pod of pods) {
        const reason = skipReason(pod, options);
        if (reason) plan.skip.push({ ...podRef(pod), reason });
        else plan.evict.push(podRef(pod));
    }
    return plan;
}

/** The pods the API server says are on this node, whatever state they are in. */
function podsOnNode(name: string): Promise<V1Pod[]> {
    return apis()
        .core.listPodForAllNamespaces({ fieldSelector: `spec.nodeName=${name}` })
        .then((res) => res.items);
}

/** What a drain would do, for the options the dialog currently shows. */
export function getDrainPlan(name: string, options: DrainOptions): Promise<DrainPlan> {
    return withK8s('nodes.drainPlan', async () => planFor(await podsOnNode(name), options));
}

interface CordonPatch extends KubernetesObject {
    spec: { unschedulable: boolean };
}

/** Stop or resume scheduling on a node. Cordoning leaves running pods alone; only new ones are refused. */
export function setNodeUnschedulable(name: string, unschedulable: boolean, op: string): Promise<void> {
    const patch: CordonPatch = {
        apiVersion: 'v1',
        kind: 'Node',
        metadata: { name },
        spec: { unschedulable },
    };
    return withK8s(op, async () => {
        await apis().objects.patch(patch);
    });
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/** A 429 is the disruption budget talking: the pod may go later, just not now. */
const isBudgetRefusal = (error: unknown): boolean => error instanceof ApiException && error.code === 429;
/** A pod that is already gone is a pod that no longer needs evicting. */
const isGone = (error: unknown): boolean => error instanceof ApiException && error.code === 404;

/**
 * Evict one pod, waiting out the disruption budgets that hold it back. Resolves true when the pod
 * is gone or on its way, false when the drain was stopped or the wait ran out.
 *
 * This is the one cluster call in the app that does not go through `withK8s`, deliberately: that
 * wrapper caps a call at the read timeout, which is exactly the wrong ceiling for a loop whose job
 * is to keep asking for two minutes. The loop's own deadline is the ceiling here, the eviction
 * API's status codes stay readable rather than being normalised away, and anything unexpected
 * still reaches the stream's error path.
 */
async function evictPod(
    pod: DrainPod,
    options: DrainOptions,
    send: StreamSend,
    stopped: () => boolean,
    now = () => Date.now(),
): Promise<boolean> {
    const deadline = now() + EVICTION_TIMEOUT_MS;
    send({ type: 'data', data: { type: 'evicting', pod } });
    while (!stopped()) {
        try {
            await apis().core.createNamespacedPodEviction({
                name: pod.name,
                namespace: pod.namespace,
                body: {
                    apiVersion: 'policy/v1',
                    kind: 'Eviction',
                    metadata: { name: pod.name, namespace: pod.namespace },
                    deleteOptions:
                        options.gracePeriodSeconds === undefined
                            ? undefined
                            : { gracePeriodSeconds: options.gracePeriodSeconds },
                },
            });
            send({ type: 'data', data: { type: 'evicted', pod } });
            return true;
        } catch (error) {
            if (isGone(error)) {
                send({ type: 'data', data: { type: 'evicted', pod } });
                return true;
            }
            if (!isBudgetRefusal(error)) throw error;
            if (now() >= deadline) return false;
            send({
                type: 'data',
                data: { type: 'blocked', pod, reason: 'a disruption budget is holding it back' },
            });
            await delay(RETRY_DELAY_MS);
        }
    }
    return false;
}

/**
 * Drain one node: cordon it, work out what may go, then evict those pods one at a time so the
 * cluster is never asked to lose more than one at once. Stopping ends the evictions but leaves the
 * node cordoned — undoing that is the operator's decision, not a side effect of a cancelled drain.
 */
export async function startNodeDrain(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['nodes.drain'].parse(rawInput);
    assertContext(input.context, 'nodes.drain');

    let stopped = false;
    let ended = false;
    /**
     * Stopping ends the stream there and then. The eviction already in flight is not something we
     * can recall, and waiting for it would leave the renderer watching a drain that has been called
     * off; anything that call reports afterwards is dropped rather than pushed into a closed stream.
     */
    const finish = () => {
        if (ended) return;
        ended = true;
        send({ type: 'end' });
    };
    const push: StreamSend = (message) => {
        if (!ended) send(message);
    };

    const run = async () => {
        await setNodeUnschedulable(input.name, true, 'nodes.drain');
        push({ type: 'data', data: { type: 'cordoned' } });

        const pods = await withK8s('nodes.drain', () => podsOnNode(input.name));
        const plan = planFor(pods, input);
        push({ type: 'data', data: { type: 'plan', plan } });

        let evicted = 0;
        for (const pod of plan.evict) {
            if (stopped) break;
            const gone = await evictPod(pod, input, push, () => stopped);
            if (gone) evicted += 1;
        }
        if (!stopped) {
            push({ type: 'data', data: { type: 'done', evicted, left: plan.evict.length - evicted } });
        }
    };

    void run()
        .catch((error: unknown) => {
            const message = error instanceof K8sError ? error.detail : ((error as Error)?.message ?? String(error));
            if (!stopped) push({ type: 'error', message });
        })
        .finally(finish);

    return {
        stop: () => {
            stopped = true;
            finish();
        },
    };
}
