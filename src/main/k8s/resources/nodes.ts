import type { V1Node } from '@kubernetes/client-node';
import type { Usage } from '../../../shared/k8s/metrics.js';
import type { Node, NodeDetail } from '../../../shared/k8s/nodes.js';
import type { CordonInput, WriteResult } from '../../../shared/k8s/write.js';
import { apis, isSafeSelectorValue, readOrNull } from '../client.js';
import { setNodeUnschedulable } from '../drain.js';
import { K8sError, withK8s } from '../errors.js';
import { assertContext } from './write.js';
import { age, cpuToCores, cpuToMillicores, dash, memToGiB, memToMi, toPairs } from '../format.js';
import { ensureSampler, nodeUsage, percent } from '../sampler.js';
import { nodeReady } from './cluster.js';

const ROLE_LABEL_PREFIX = 'node-role.kubernetes.io/';
const INSTANCE_TYPE_LABELS = ['node.kubernetes.io/instance-type', 'beta.kubernetes.io/instance-type'];

/** Roles from `node-role.kubernetes.io/<role>` labels, comma-joined, or `worker`. */
export function nodeRole(node: V1Node): string {
    const labels = node.metadata?.labels ?? {};
    const roles = Object.keys(labels)
        .filter((key) => key.startsWith(ROLE_LABEL_PREFIX))
        .map((key) => key.slice(ROLE_LABEL_PREFIX.length))
        .filter(Boolean);
    return roles.length ? roles.join(',') : 'worker';
}

/** Cordoned wins over readiness: an unschedulable node is the operator's decision, not a fault. */
export function nodeStatus(node: V1Node): Node['status'] {
    if (node.spec?.unschedulable) return 'Cordoned';
    return nodeReady(node) ? 'Ready' : 'NotReady';
}

export function instanceType(node: V1Node): string {
    const labels = node.metadata?.labels ?? {};
    for (const label of INSTANCE_TYPE_LABELS) {
        const value = labels[label];
        if (value) return value;
    }
    return '—';
}

/** `usage` is the latest metrics-server sample for the node; percentages are null without one. */
export function toNode(node: V1Node, now = Date.now(), usage?: Usage): Node {
    const allocatable = node.status?.allocatable ?? node.status?.capacity ?? {};
    const name = node.metadata?.name ?? '';
    return {
        name,
        status: nodeStatus(node),
        role: nodeRole(node),
        version: dash(node.status?.nodeInfo?.kubeletVersion),
        cpu: cpuToCores(allocatable.cpu),
        memory: memToGiB(allocatable.memory),
        cpuUsed: usage ? percent(usage.cpu, cpuToMillicores(allocatable.cpu)) : null,
        memUsed: usage ? percent(usage.mem, memToMi(allocatable.memory)) : null,
        age: age(node.metadata?.creationTimestamp, now),
        instanceType: instanceType(node),
    };
}

export function toNodeDetail(node: V1Node, pods: number, now = Date.now(), usage?: Usage): NodeDetail {
    const info = node.status?.nodeInfo;
    return {
        ...toNode(node, now, usage),
        pods,
        conditions: (node.status?.conditions ?? []).map((c) => ({
            type: c.type,
            status: c.status,
            reason: c.reason || undefined,
        })),
        info: {
            os: dash(info?.osImage),
            kernel: dash(info?.kernelVersion),
            containerRuntime: dash(info?.containerRuntimeVersion),
            kubeletVersion: dash(info?.kubeletVersion),
            architecture: dash(info?.architecture),
        },
        labels: toPairs(node.metadata?.labels),
        annotations: toPairs(node.metadata?.annotations),
    };
}

/** The node objects alone, a few kilobytes: the list never asks for pods, that is the detail's job. */
export function listNodes(): Promise<Node[]> {
    return withK8s('nodes.list', async () => {
        const res = await apis().core.listNode();
        ensureSampler();
        return res.items.map((node) => toNode(node, Date.now(), nodeUsage(node.metadata?.name ?? '')));
    });
}

/** How many pods the API server says are scheduled on this node, without listing the cluster's. */
async function countPodsOnNode(name: string, op: string): Promise<number> {
    // A node name is DNS-1123, so anything else cannot be a node and must not reach a selector.
    if (!isSafeSelectorValue(name)) throw new K8sError('invalid', `"${name}" is not a valid node name.`, op);
    const res = await apis().core.listPodForAllNamespaces({ fieldSelector: `spec.nodeName=${name}` });
    return res.items.length;
}

/**
 * Cordon or uncordon a node. Running pods stay where they are either way: cordoning only stops the
 * scheduler putting new ones here, which is what makes it safe to do before deciding to drain.
 */
export function cordonNode(input: CordonInput): Promise<WriteResult> {
    const op = 'nodes.cordon';
    return withK8s(op, async () => {
        assertContext(input.context, op);
        await setNodeUnschedulable(input.name, input.unschedulable, op);
        return { kind: 'Node', name: input.name };
    });
}

/**
 * Null when no node has that name, so the UI shows "not found" rather than an error. Reads the one
 * node and asks the API server only for the pods scheduled on it; the cluster's other nodes and
 * pods are not this screen's business.
 */
export function getNode(name: string): Promise<NodeDetail | null> {
    const op = 'nodes.get';
    return withK8s(op, async () => {
        const [node, pods] = await Promise.all([
            readOrNull(() => apis().core.readNode({ name })),
            countPodsOnNode(name, op),
        ]);
        ensureSampler();
        return node ? toNodeDetail(node, pods, Date.now(), nodeUsage(name)) : null;
    });
}
