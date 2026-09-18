import type { V1Namespace, V1Node } from '@kubernetes/client-node';
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
 * The namespace objects alone. This list is what the selector and the palette open with, so it
 * must stay a few kilobytes: counting the pods inside each namespace would mean listing every pod
 * in the cluster, and that belongs to the screens that show pods.
 */
export function listNamespaces(): Promise<Namespace[]> {
    return withK8s('namespaces.list', async () => {
        const active = getActiveNamespace();
        const res = await apis().core.listNamespace();
        return res.items.map((ns) => toNamespace(ns, active));
    });
}

/**
 * The active namespace, or a null name when none is selected. This is the app's own memory, not a
 * cluster read, so it answers at once and still answers while the cluster is unreachable. The
 * renderer labels the null case; main never hands out a label as a name.
 */
export async function getActiveNamespaceInfo(): Promise<ActiveNamespace> {
    return { name: getActiveNamespace() };
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
