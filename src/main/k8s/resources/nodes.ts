import type { V1Node } from '@kubernetes/client-node';
import type { Usage } from '../../../shared/k8s/metrics.js';
import type { Node, NodeDetail } from '../../../shared/k8s/nodes.js';
import { apis } from '../client.js';
import { withK8s } from '../errors.js';
import { age, cpuToCores, cpuToMillicores, dash, memToGiB, memToMi } from '../format.js';
import { ensureSampler, nodeUsage, percent } from '../sampler.js';
import { countBy, nodeReady } from './cluster.js';

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
export function toNode(node: V1Node, podsByNode: Map<string, number>, now = Date.now(), usage?: Usage): Node {
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
        pods: podsByNode.get(name) ?? 0,
        age: age(node.metadata?.creationTimestamp, now),
        instanceType: instanceType(node),
    };
}

export function toNodeDetail(
    node: V1Node,
    podsByNode: Map<string, number>,
    now = Date.now(),
    usage?: Usage,
): NodeDetail {
    const info = node.status?.nodeInfo;
    return {
        ...toNode(node, podsByNode, now, usage),
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
    };
}

async function podsPerNode(): Promise<Map<string, number>> {
    const res = await apis().core.listPodForAllNamespaces();
    return countBy(res.items, (pod) => pod.spec?.nodeName);
}

export function listNodes(): Promise<Node[]> {
    return withK8s('nodes.list', async () => {
        const [res, podsByNode] = await Promise.all([apis().core.listNode(), podsPerNode()]);
        ensureSampler();
        return res.items.map((node) => toNode(node, podsByNode, Date.now(), nodeUsage(node.metadata?.name ?? '')));
    });
}

/** Null when no node has that name, so the UI shows "not found" rather than an error. */
export function getNode(name: string): Promise<NodeDetail | null> {
    return withK8s('nodes.get', async () => {
        const [res, podsByNode] = await Promise.all([apis().core.listNode(), podsPerNode()]);
        const node = res.items.find((n) => n.metadata?.name === name);
        ensureSampler();
        return node ? toNodeDetail(node, podsByNode, Date.now(), nodeUsage(name)) : null;
    });
}
