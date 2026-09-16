import type { V1Namespace, V1Node, V1Pod } from '@kubernetes/client-node';
import type { KubeContext } from '../../../shared/k8s/contexts.js';
import type { ActiveNamespace, Cluster, Namespace, NamespaceTone } from '../../../shared/k8s/cluster.js';
import { apis, getActiveNamespace } from '../client.js';
import { getCurrentContext, listContexts } from '../context.js';
import { withK8s } from '../errors.js';

/*
 * Pure transforms from Kubernetes objects to view models are exported and unit tested on their
 * own; the exported readers only fetch and delegate, so a future watch stream can reuse the same
 * transforms on incoming events.
 */

const PROVIDER_LABELS: Record<string, string> = {
    aws: 'AWS',
    gce: 'GCP',
    azure: 'Azure',
    digitalocean: 'DigitalOcean',
    hetzner: 'Hetzner',
    k3s: 'k3s',
};
const REGION_LABELS = ['topology.kubernetes.io/region', 'failure-domain.beta.kubernetes.io/region'];

/** Provider from the first node's `spec.providerID` scheme (`aws:///…`), or a generic fallback. */
export function providerFromNode(node?: V1Node): string {
    const id = node?.spec?.providerID;
    if (!id) return 'Kubernetes';
    const scheme = id.split(':', 1)[0] ?? '';
    return PROVIDER_LABELS[scheme] ?? scheme;
}

export function regionFromNode(node?: V1Node): string {
    const labels = node?.metadata?.labels ?? {};
    for (const label of REGION_LABELS) {
        const value = labels[label];
        if (value) return value;
    }
    return '—';
}

export function nodeReady(node: V1Node): boolean {
    return node.status?.conditions?.some((c) => c.type === 'Ready' && c.status === 'True') ?? false;
}

/** Count pods per namespace (or any other key) from a cluster-wide pod list. */
export function countBy(pods: V1Pod[], key: (pod: V1Pod) => string | undefined): Map<string, number> {
    const counts = new Map<string, number>();
    for (const pod of pods) {
        const k = key(pod);
        if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    return counts;
}

export function namespaceTone(ns: V1Namespace, active: string | null): NamespaceTone {
    if (ns.metadata?.name === active) return 'accent';
    return ns.status?.phase === 'Active' ? 'ok' : 'warn';
}

export function toNamespace(ns: V1Namespace, podCounts: Map<string, number>, active: string | null): Namespace {
    const name = ns.metadata?.name ?? '';
    return { name, pods: podCounts.get(name) ?? 0, tone: namespaceTone(ns, active) };
}

export function toCluster(context: KubeContext, nodes: V1Node[], gitVersion: string): Cluster {
    const first = nodes[0];
    return {
        name: context.name,
        nodes: nodes.length,
        status: nodes.length > 0 && nodes.every(nodeReady) ? 'Healthy' : 'Degraded',
        version: gitVersion.replace(/^v/, ''),
        provider: providerFromNode(first),
        region: regionFromNode(first),
    };
}

/** What is known from the kubeconfig alone, used when the API server cannot be asked. */
export function minimalCluster(context: KubeContext, status: Cluster['status'] = 'Healthy'): Cluster {
    return { name: context.name, nodes: 0, status, version: '—', provider: context.cluster, region: '—' };
}

async function podsPerNamespace(): Promise<Map<string, number>> {
    const res = await apis().core.listPodForAllNamespaces();
    return countBy(res.items, (pod) => pod.metadata?.namespace);
}

export function listNamespaces(): Promise<Namespace[]> {
    return withK8s('namespaces.list', async () => {
        const active = getActiveNamespace();
        const [res, podCounts] = await Promise.all([apis().core.listNamespace(), podsPerNamespace()]);
        return res.items.map((ns) => toNamespace(ns, podCounts, active));
    });
}

/**
 * The active namespace with its pod count, or a null name with the all-namespaces total when none
 * is selected. The renderer labels the null case; main never hands out a label as a name.
 */
export function getActiveNamespaceInfo(): Promise<ActiveNamespace | null> {
    return withK8s('namespace.active', async () => {
        const active = getActiveNamespace();
        const podCounts = await podsPerNamespace();
        if (!active) {
            const total = [...podCounts.values()].reduce((sum, n) => sum + n, 0);
            return { name: null, pods: total, tone: 'accent' };
        }
        return { name: active, pods: podCounts.get(active) ?? 0, tone: 'accent' };
    });
}

/**
 * Live facts about the active context's cluster. When the API server cannot be reached the
 * context is still reported, from the kubeconfig, marked Degraded, so the UI shows where it is
 * pointed rather than an error.
 */
export function getActiveCluster(): Promise<Cluster | null> {
    return withK8s('cluster.active', async () => {
        const context = getCurrentContext();
        if (!context) return null;
        try {
            const [nodes, version] = await Promise.all([apis().core.listNode(), apis().version.getCode()]);
            return toCluster(context, nodes.items, version.gitVersion);
        } catch {
            return minimalCluster(context, 'Degraded');
        }
    });
}

/** One entry per kube-context; only the active one carries live facts. Always populates offline. */
export function listClusters(): Promise<Cluster[]> {
    return withK8s('clusters.list', async () => {
        const active = await getActiveCluster();
        return listContexts().map((ctx) => (active && ctx.current ? active : minimalCluster(ctx)));
    });
}
