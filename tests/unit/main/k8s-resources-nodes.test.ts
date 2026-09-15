import type { V1Node, V1Pod } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const client = { apis: vi.fn(), getActiveNamespace: vi.fn() };
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

    it('builds the list row with converted capacity, pods and age', () => {
        expect(nodes.toNode(node(), new Map([['n1', 7]]), NOW)).toEqual({
            name: 'n1',
            status: 'Ready',
            role: 'control-plane',
            version: 'v1.36.4+k3s1',
            cpu: 4,
            memory: 7.8,
            cpuUsed: null,
            memUsed: null,
            pods: 7,
            age: '3d',
            instanceType: 'k3s',
        });
    });

    it('falls back to capacity when allocatable is missing and dashes unknown fields', () => {
        const bare = node({ metadata: { name: 'n2' }, status: { capacity: { cpu: '2', memory: '1Gi' } } });
        expect(nodes.toNode(bare, new Map(), NOW)).toMatchObject({
            cpu: 2,
            memory: 1,
            version: '—',
            age: '—',
            pods: 0,
            status: 'NotReady',
        });
    });

    it('builds the detail with conditions and system info', () => {
        const detail = nodes.toNodeDetail(node(), new Map(), NOW);
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
                new Map(),
                NOW,
            ).annotations,
        ).toEqual([['note', 'x']]);
        expect(
            nodes.toNodeDetail(
                node({ status: { conditions: [{ type: 'Ready', status: 'True', reason: '' }] } }),
                new Map(),
                NOW,
            ).conditions[0]?.reason,
        ).toBeUndefined();
    });
});

describe('node readers', () => {
    beforeEach(() => {
        const pods = [{ spec: { nodeName: 'n1' } }, { spec: { nodeName: 'n1' } }, { spec: {} }] as V1Pod[];
        client.apis.mockReturnValue({
            core: {
                listNode: async () => ({ items: [node(), node({ metadata: { name: 'n2' } })] }),
                listPodForAllNamespaces: async () => ({ items: pods }),
            },
        });
    });

    it('lists nodes with pods counted per node and usage as percent of allocatable', async () => {
        sampler.nodeUsage.mockImplementation((name: string) => (name === 'n1' ? { cpu: 1000, mem: 3970 } : undefined));
        const list = await nodes.listNodes();
        expect(list.map((n) => [n.name, n.pods, n.cpuUsed, n.memUsed])).toEqual([
            ['n1', 2, 25, 50],
            ['n2', 0, null, null],
        ]);
        expect(sampler.ensureSampler).toHaveBeenCalled();
    });

    it('gets one node by name or null', async () => {
        await expect(nodes.getNode('n1')).resolves.toMatchObject({
            name: 'n1',
            pods: 2,
            info: { architecture: 'arm64' },
        });
        await expect(nodes.getNode('missing')).resolves.toBeNull();
    });

    it('classifies API failures', async () => {
        client.apis.mockReturnValue({
            core: {
                listNode: () => Promise.reject(Object.assign(new Error('x'), { code: 401 })),
                listPodForAllNamespaces: async () => ({ items: [] }),
            },
        });
        await expect(nodes.listNodes()).rejects.toMatchObject({ kind: 'unauthorized', op: 'nodes.list' });
    });
});
