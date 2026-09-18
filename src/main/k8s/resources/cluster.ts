import type { V1Namespace, V1Node, V1Pod } from '@kubernetes/client-node';
import type { KubeContext } from '../../../shared/k8s/contexts.js';
import type {
    ActiveNamespace,
    Cluster,
    Namespace,
    NamespacePodCounts,
    NamespaceTone,
} from '../../../shared/k8s/cluster.js';
import { apis, getActiveNamespace } from '../client.js';
import { getCurrentContext, listContexts } from '../context.js';
import { toK8sError, withK8s } from '../errors.js';

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

export function toNamespace(ns: V1Namespace, active: string | null): Namespace {
    return { name: ns.metadata?.name ?? '', tone: namespaceTone(ns, active) };
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

/**
 * The namespace objects alone. This is the read the app primes at startup and the selector lives
 * on, so it must stay a single small list: nothing here may fan out to pods or any other kind.
 */
export function listNamespaces(): Promise<Namespace[]> {
    return withK8s('namespaces.list', async () => {
        const active = getActiveNamespace();
        const res = await apis().core.listNamespace();
        return res.items.map((ns) => toNamespace(ns, active));
    });
}

/** Pods per namespace from one cluster-wide pod list, for the screens that show counts. */
export function countPodsPerNamespace(): Promise<NamespacePodCounts> {
    return withK8s('namespaces.podCounts', async () => {
        const res = await apis().core.listPodForAllNamespaces();
        return Object.fromEntries(countBy(res.items, (pod) => pod.metadata?.namespace));
    });
}

/**
 * The active namespace, or a null name when none is selected. This is the app's own memory, not a
 * cluster read, so it answers at once and still answers while the cluster is unreachable. The
 * renderer labels the null case; main never hands out a label as a name.
 */
export function getActiveNamespaceInfo(): Promise<ActiveNamespace | null> {
    return withK8s('namespace.active', async () => ({ name: getActiveNamespace() }));
}

/**
 * Live facts about the active context's cluster. When the API server cannot be reached the
 * context is still reported, from the kubeconfig, marked Degraded and carrying the classified
 * reason, so the UI shows where it is pointed and why nothing loads rather than a bare error.
 * The probe runs under its own read ceiling: a hang counts as a problem like any other.
 */
export async function getActiveCluster(): Promise<Cluster | null> {
    const context = await withK8s('cluster.active', async () => getCurrentContext());
    if (!context) return null;
    try {
        const [nodes, version] = await withK8s('cluster.active', () =>
            Promise.all([apis().core.listNode(), apis().version.getCode()]),
        );
        return toCluster(context, nodes.items, version.gitVersion);
    } catch (error) {
        const { kind, detail } = toK8sError('cluster.active', error);
        return { ...minimalCluster(context, 'Degraded'), problem: { kind, detail } };
    }
}

/** One entry per kube-context; only the active one carries live facts. Always populates offline. */
export function listClusters(): Promise<Cluster[]> {
    return withK8s('clusters.list', async () => {
        const active = await getActiveCluster();
        return listContexts().map((ctx) => (active && ctx.current ? active : minimalCluster(ctx)));
    });
}
