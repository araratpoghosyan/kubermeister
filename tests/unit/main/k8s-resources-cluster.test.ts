import type { V1Namespace, V1Node } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { apis: vi.fn(), getActiveNamespace: vi.fn<() => string | null>() };
const context = { getCurrentContext: vi.fn(), listContexts: vi.fn() };
vi.mock('../../../src/main/k8s/client.js', () => client);
vi.mock('../../../src/main/k8s/context.js', () => context);

const cluster = await import('../../../src/main/k8s/resources/cluster.js');

const alpha = { name: 'alpha', cluster: 'alpha-cluster', user: 'u', namespace: 'team-a', current: true };
const beta = { name: 'beta', cluster: 'beta-cluster', user: 'u', current: false };

function node(overrides: Partial<V1Node> = {}, ready = true): V1Node {
    return {
        metadata: { name: 'n1', labels: {} },
        spec: {},
        status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
        ...overrides,
    } as V1Node;
}
function ns(name: string, phase = 'Active'): V1Namespace {
    return { metadata: { name }, status: { phase } } as V1Namespace;
}

/** Nothing in this module may list pods: a namespace or cluster read that does is the bug being tested for. */
const listPodForAllNamespaces = vi.fn(() => Promise.reject(new Error('listed every pod in the cluster')));

function mockApis(overrides: { nodes?: V1Node[]; namespaces?: V1Namespace[]; version?: string; fail?: boolean }) {
    const failing = () => Promise.reject(Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }));
    client.apis.mockReturnValue({
        core: {
            listNode: overrides.fail ? failing : async () => ({ items: overrides.nodes ?? [] }),
            listPodForAllNamespaces,
            listNamespace: async () => ({ items: overrides.namespaces ?? [] }),
        },
        version: {
            getCode: overrides.fail ? failing : async () => ({ gitVersion: overrides.version ?? 'v1.36.4+k3s1' }),
        },
    });
}

describe('pure transforms', () => {
    it('infers provider from the providerID scheme with known labels', () => {
        expect(cluster.providerFromNode(node({ spec: { providerID: 'aws:///eu-west-1a/i-123' } }))).toBe('AWS');
        expect(cluster.providerFromNode(node({ spec: { providerID: 'k3s://n1' } }))).toBe('k3s');
        expect(cluster.providerFromNode(node({ spec: { providerID: 'openstack:///x' } }))).toBe('openstack');
        expect(cluster.providerFromNode(node())).toBe('Kubernetes');
        expect(cluster.providerFromNode(undefined)).toBe('Kubernetes');
    });

    it('reads the region from either topology label', () => {
        expect(
            cluster.regionFromNode(node({ metadata: { labels: { 'topology.kubernetes.io/region': 'eu-west-1' } } })),
        ).toBe('eu-west-1');
        expect(
            cluster.regionFromNode(
                node({ metadata: { labels: { 'failure-domain.beta.kubernetes.io/region': 'us-1' } } }),
            ),
        ).toBe('us-1');
        expect(cluster.regionFromNode(node())).toBe('—');
    });

    it('tones namespaces: active wins, Active is ok, anything else warns', () => {
        expect(cluster.namespaceTone(ns('team-a'), 'team-a')).toBe('accent');
        expect(cluster.namespaceTone(ns('kube-system'), 'team-a')).toBe('ok');
        expect(cluster.namespaceTone(ns('old', 'Terminating'), 'team-a')).toBe('warn');
        expect(cluster.toNamespace(ns('team-a'), 'team-a')).toEqual({ name: 'team-a', tone: 'accent' });
    });

    it('builds the cluster summary and marks any not-ready node as Degraded', () => {
        const healthy = cluster.toCluster(alpha, [node(), node({ metadata: { name: 'n2' } })], 'v1.36.4+k3s1');
        expect(healthy).toEqual({
            name: 'alpha',
            nodes: 2,
            status: 'Healthy',
            version: '1.36.4+k3s1',
            provider: 'Kubernetes',
            region: '—',
        });
        expect(cluster.toCluster(alpha, [node(), node({}, false)], 'v1').status).toBe('Degraded');
        expect(cluster.toCluster(alpha, [], 'v1').status).toBe('Degraded');
        expect(cluster.minimalCluster(beta)).toEqual({
            name: 'beta',
            nodes: 0,
            status: 'Healthy',
            version: '—',
            provider: 'beta-cluster',
            region: '—',
        });
    });
});

describe('readers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.getActiveNamespace.mockReturnValue('team-a');
        context.getCurrentContext.mockReturnValue(alpha);
        context.listContexts.mockReturnValue([alpha, beta]);
    });

    it('lists namespaces with tones, and never the pods inside them', async () => {
        mockApis({ namespaces: [ns('team-a'), ns('kube-system'), ns('gone', 'Terminating')] });
        await expect(cluster.listNamespaces()).resolves.toEqual([
            { name: 'team-a', tone: 'accent' },
            { name: 'kube-system', tone: 'ok' },
            { name: 'gone', tone: 'warn' },
        ]);
        expect(listPodForAllNamespaces).not.toHaveBeenCalled();
    });

    it('answers the active namespace from memory, without a cluster call', async () => {
        client.apis.mockImplementation(() => {
            throw new Error('the active namespace is not a cluster read');
        });
        await expect(cluster.getActiveNamespaceInfo()).resolves.toEqual({ name: 'team-a' });
        client.getActiveNamespace.mockReturnValue(null);
        // No label stands in for the name: the renderer says "All namespaces", main says null.
        await expect(cluster.getActiveNamespaceInfo()).resolves.toEqual({ name: null });
    });

    it('returns live cluster facts for the active context', async () => {
        mockApis({ nodes: [node({ spec: { providerID: 'k3s://n1' } })], version: 'v1.36.4+k3s1' });
        await expect(cluster.getActiveCluster()).resolves.toEqual({
            name: 'alpha',
            nodes: 1,
            status: 'Healthy',
            version: '1.36.4+k3s1',
            provider: 'k3s',
            region: '—',
        });
    });

    it('falls back to kubeconfig facts marked Degraded when the API server is unreachable', async () => {
        mockApis({ fail: true });
        await expect(cluster.getActiveCluster()).resolves.toEqual({
            name: 'alpha',
            nodes: 0,
            status: 'Degraded',
            version: '—',
            provider: 'alpha-cluster',
            region: '—',
        });
    });

    it('returns null without a current context', async () => {
        context.getCurrentContext.mockReturnValue(null);
        await expect(cluster.getActiveCluster()).resolves.toBeNull();
    });

    it('lists one cluster per context, enriching only the active one', async () => {
        mockApis({ nodes: [node()], version: 'v1.2.3' });
        const list = await cluster.listClusters();
        expect(list.map((c) => [c.name, c.version])).toEqual([
            ['alpha', '1.2.3'],
            ['beta', '—'],
        ]);
    });

    it('wraps failures of the namespace list into a classified error', async () => {
        client.apis.mockReturnValue({
            core: { listNamespace: () => Promise.reject(Object.assign(new Error('x'), { code: 403 })) },
        });
        await expect(cluster.listNamespaces()).rejects.toMatchObject({ kind: 'forbidden', op: 'namespaces.list' });
    });
});
