import { ApiException } from '@kubernetes/client-node';
import type { V1Node, V1Pod } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = {
    apis: vi.fn(),
    getActiveNamespace: vi.fn(),
    activeContextName: vi.fn<() => string>(() => 'alpha'),
    // The two pure helpers the reader takes from the client module, as the real module defines them.
    isSafeSelectorValue: (value: string) => /^[A-Za-z0-9.-]+$/.test(value),
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ApiException && error.code === 404) return undefined;
            throw error;
        }
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);
const sampler = {
    ensureSampler: vi.fn(),
    nodeUsage: vi.fn(),
    percent: (used: number, total: number) => (total > 0 ? Math.round((used / total) * 100) : 0),
};
vi.mock('../../../src/main/k8s/sampler.js', () => sampler);
vi.mock('../../../src/main/k8s/context.js', () => ({ getCurrentContext: vi.fn(), listContexts: vi.fn() }));

const nodes = await import('../../../src/main/k8s/resources/nodes.js');

const NOW = Date.parse('2026-09-15T12:00:00Z');

function node(overrides: Partial<V1Node> = {}): V1Node {
    return {
        metadata: {
            name: 'n1',
            creationTimestamp: new Date(NOW - 3 * 24 * 3600 * 1000),
            labels: { 'node-role.kubernetes.io/control-plane': 'true', 'node.kubernetes.io/instance-type': 'k3s' },
        },
        spec: {},
        status: {
            conditions: [
                { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory' },
                { type: 'Ready', status: 'True', reason: 'KubeletReady' },
            ],
            allocatable: { cpu: '4', memory: '7940Mi', pods: '110' },
            nodeInfo: {
                kubeletVersion: 'v1.36.4+k3s1',
                osImage: 'K3s v1.36.4',
                kernelVersion: '6.6.0',
                containerRuntimeVersion: 'containerd://2.0',
                architecture: 'arm64',
            } as V1Node['status'] extends { nodeInfo?: infer I } ? I : never,
        },
        ...overrides,
    } as V1Node;
}

describe('node transforms', () => {
    it('derives roles, falling back to worker', () => {
        expect(nodes.nodeRole(node())).toBe('control-plane');
        expect(
            nodes.nodeRole(
                node({
                    metadata: { labels: { 'node-role.kubernetes.io/master': '', 'node-role.kubernetes.io/etcd': '' } },
                }),
            ),
        ).toBe('master,etcd');
        expect(nodes.nodeRole(node({ metadata: { labels: {} } }))).toBe('worker');
    });

    it('reports Cordoned over readiness, then Ready or NotReady', () => {
        expect(nodes.nodeStatus(node())).toBe('Ready');
        expect(nodes.nodeStatus(node({ spec: { unschedulable: true } }))).toBe('Cordoned');
        expect(nodes.nodeStatus(node({ status: { conditions: [{ type: 'Ready', status: 'Unknown' }] } }))).toBe(
            'NotReady',
        );
        expect(nodes.nodeStatus(node({ status: {} }))).toBe('NotReady');
    });

    it('reads the instance type from either label', () => {
        expect(nodes.instanceType(node())).toBe('k3s');
        expect(
            nodes.instanceType(node({ metadata: { labels: { 'beta.kubernetes.io/instance-type': 'm5.large' } } })),
        ).toBe('m5.large');
        expect(nodes.instanceType(node({ metadata: { labels: {} } }))).toBe('—');
    });

    it('builds the list row with converted capacity and age, and no pod count', () => {
        expect(nodes.toNode(node(), NOW)).toEqual({
            name: 'n1',
            status: 'Ready',
            role: 'control-plane',
            version: 'v1.36.4+k3s1',
            cpu: 4,
            memory: 7.8,
            cpuUsed: null,
            memUsed: null,
            age: '3d',
            instanceType: 'k3s',
        });
    });

    it('falls back to capacity when allocatable is missing and dashes unknown fields', () => {
        const bare = node({ metadata: { name: 'n2' }, status: { capacity: { cpu: '2', memory: '1Gi' } } });
        expect(nodes.toNode(bare, NOW)).toMatchObject({
            cpu: 2,
            memory: 1,
            version: '—',
            age: '—',
            status: 'NotReady',
        });
    });

    it('builds the detail with its pod count, conditions and system info', () => {
        const detail = nodes.toNodeDetail(node(), 7, NOW);
        expect(detail.pods).toBe(7);
        expect(detail.conditions).toEqual([
            { type: 'MemoryPressure', status: 'False', reason: 'KubeletHasSufficientMemory' },
            { type: 'Ready', status: 'True', reason: 'KubeletReady' },
        ]);
        expect(detail.info).toEqual({
            os: 'K3s v1.36.4',
            kernel: '6.6.0',
            containerRuntime: 'containerd://2.0',
            kubeletVersion: 'v1.36.4+k3s1',
            architecture: 'arm64',
        });
        expect(detail.labels).toEqual([
            ['node-role.kubernetes.io/control-plane', 'true'],
            ['node.kubernetes.io/instance-type', 'k3s'],
        ]);
        expect(detail.annotations).toEqual([]);
        expect(
            nodes.toNodeDetail(
                node({
                    metadata: {
                        name: 'n1',
                        annotations: { note: 'x', 'kubectl.kubernetes.io/last-applied-configuration': '{}' },
                    },
                }),
                0,
                NOW,
            ).annotations,
        ).toEqual([['note', 'x']]);
        expect(
            nodes.toNodeDetail(
                node({ status: { conditions: [{ type: 'Ready', status: 'True', reason: '' }] } }),
                0,
                NOW,
            ).conditions[0]?.reason,
        ).toBeUndefined();
    });
});

describe('node readers', () => {
    const listPodForAllNamespaces = vi.fn();
    const readNode = vi.fn();
    beforeEach(() => {
        const pods = [{ spec: { nodeName: 'n1' } }, { spec: { nodeName: 'n1' } }, { spec: {} }] as V1Pod[];
        listPodForAllNamespaces.mockReset();
        listPodForAllNamespaces.mockImplementation(async (params?: { fieldSelector?: string }) => {
            // The cluster's pods are never listed whole here; only a node's own may be asked for.
            if (!params?.fieldSelector) throw new Error('listed every pod in the cluster');
            return { items: pods.filter((p) => `spec.nodeName=${p.spec?.nodeName}` === params.fieldSelector) };
        });
        readNode.mockReset();
        readNode.mockImplementation(async ({ name }: { name: string }) => {
            if (name === 'n1') return node();
            throw new ApiException(404, 'not found', {}, {});
        });
        sampler.ensureSampler.mockReset();
        client.apis.mockReturnValue({
            core: {
                listNode: async () => ({ items: [node(), node({ metadata: { name: 'n2' } })] }),
                listPodForAllNamespaces,
                readNode,
            },
        });
    });

    it('lists nodes with usage as percent of allocatable, without touching pods', async () => {
        sampler.nodeUsage.mockImplementation((name: string) => (name === 'n1' ? { cpu: 1000, mem: 3970 } : undefined));
        const list = await nodes.listNodes();
        expect(list.map((n) => [n.name, n.cpuUsed, n.memUsed])).toEqual([
            ['n1', 25, 50],
            ['n2', null, null],
        ]);
        expect(list[0]).not.toHaveProperty('pods');
        expect(listPodForAllNamespaces).not.toHaveBeenCalled();
        expect(sampler.ensureSampler).toHaveBeenCalled();
    });

    it('gets one node by a direct read and counts only its pods through a field selector', async () => {
        await expect(nodes.getNode('n1')).resolves.toMatchObject({
            name: 'n1',
            pods: 2,
            info: { architecture: 'arm64' },
        });
        expect(readNode).toHaveBeenCalledWith({ name: 'n1' });
        expect(listPodForAllNamespaces).toHaveBeenCalledWith({ fieldSelector: 'spec.nodeName=n1' });
        expect(sampler.ensureSampler).toHaveBeenCalled();
        await expect(nodes.getNode('missing')).resolves.toBeNull();
    });

    it('refuses a node name that could not be one rather than putting it in a selector', async () => {
        await expect(nodes.getNode('a,b=c')).rejects.toMatchObject({ kind: 'invalid', op: 'nodes.get' });
        expect(readNode).not.toHaveBeenCalled();
        expect(listPodForAllNamespaces).not.toHaveBeenCalled();
    });

    it('classifies API failures', async () => {
        client.apis.mockReturnValue({
            core: { listNode: () => Promise.reject(Object.assign(new Error('x'), { code: 401 })) },
        });
        await expect(nodes.listNodes()).rejects.toMatchObject({ kind: 'unauthorized', op: 'nodes.list' });
        client.apis.mockReturnValue({
            core: {
                readNode: () => Promise.reject(Object.assign(new Error('x'), { code: 403 })),
                listPodForAllNamespaces: async () => ({ items: [] }),
            },
        });
        await expect(nodes.getNode('n1')).rejects.toMatchObject({ kind: 'forbidden', op: 'nodes.get' });
    });
});

describe('cordoning a node', () => {
    it('writes the state the screen displayed, in either direction', async () => {
        const patch = vi.fn().mockResolvedValue({});
        client.apis.mockReturnValue({ objects: { patch } });
        client.activeContextName.mockReturnValue('alpha');

        await expect(nodes.cordonNode({ context: 'alpha', name: 'node-1', unschedulable: true })).resolves.toEqual({
            kind: 'Node',
            name: 'node-1',
        });
        expect(patch).toHaveBeenCalledWith(expect.objectContaining({ kind: 'Node', spec: { unschedulable: true } }));
        await nodes.cordonNode({ context: 'alpha', name: 'node-1', unschedulable: false });
        expect(patch).toHaveBeenLastCalledWith(expect.objectContaining({ spec: { unschedulable: false } }));
    });

    it('refuses one aimed at a context the app has left', async () => {
        client.activeContextName.mockReturnValue('beta');
        await expect(nodes.cordonNode({ context: 'alpha', name: 'node-1', unschedulable: true })).rejects.toMatchObject(
            { kind: 'conflict' },
        );
    });
});
