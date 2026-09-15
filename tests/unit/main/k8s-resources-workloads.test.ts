import {
    ApiException,
    type V1DaemonSet,
    type V1Deployment,
    type V1ReplicaSet,
    type V1StatefulSet,
} from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apps = {
    listNamespacedDeployment: vi.fn(),
    listDeploymentForAllNamespaces: vi.fn(),
    readNamespacedDeployment: vi.fn(),
    listNamespacedReplicaSet: vi.fn(),
    listNamespacedStatefulSet: vi.fn(),
    listStatefulSetForAllNamespaces: vi.fn(),
    readNamespacedStatefulSet: vi.fn(),
    listNamespacedDaemonSet: vi.fn(),
    listDaemonSetForAllNamespaces: vi.fn(),
    readNamespacedDaemonSet: vi.fn(),
};
const client = {
    apis: () => ({ apps }),
    getActiveNamespace: vi.fn<() => string | null>(),
    resolveObjectNamespace: (explicit?: string) => explicit ?? client.getActiveNamespace(),
    isSafeSelectorValue: (value: string) => /^[A-Za-z0-9._-]+$/.test(value),
    listItems: async <T>(
        ns: string | undefined,
        namespaced: (ns: string) => Promise<{ items: T[] }>,
        all: () => Promise<{ items: T[] }>,
    ) => {
        const resolved = ns ?? client.getActiveNamespace() ?? undefined;
        return resolved ? namespaced(resolved) : all();
    },
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ApiException && error.code === 404) return undefined;
            throw error;
        }
    },
    getNamespaced: async <T>(
        name: string,
        namespace: string | undefined,
        readOne: (name: string, ns: string) => Promise<T>,
        listByName: (selector: string) => Promise<{ items: T[] }>,
    ) => {
        const ns = client.resolveObjectNamespace(namespace);
        if (ns) return client.readOrNull(() => readOne(name, ns));
        return (await listByName(`metadata.name=${name}`)).items[0];
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);

const workloads = await import('../../../src/main/k8s/resources/workloads.js');

const NOW = Date.parse('2026-09-15T12:00:00Z');
const HOUR = 3600 * 1000;

function deployment(overrides: Partial<V1Deployment> = {}): V1Deployment {
    return {
        metadata: {
            name: 'web',
            namespace: 'team-a',
            uid: 'dep-1',
            creationTimestamp: new Date(NOW - 3 * 24 * HOUR),
            labels: { app: 'web' },
            annotations: {
                'deployment.kubernetes.io/revision': '2',
                'kubectl.kubernetes.io/last-applied-configuration': '{}',
            },
        },
        spec: {
            replicas: 3,
            selector: { matchLabels: { app: 'web' } },
            strategy: { type: 'Recreate' },
            template: { spec: { containers: [{ name: 'web', image: 'nginx:1.27' }] } },
        },
        status: { replicas: 3, readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2 },
        ...overrides,
    } as V1Deployment;
}
function replicaSet(revision: string, overrides: Partial<V1ReplicaSet> = {}): V1ReplicaSet {
    return {
        metadata: {
            name: `web-${revision}`,
            namespace: 'team-a',
            ownerReferences: [{ uid: 'dep-1', kind: 'Deployment', name: 'web', apiVersion: 'apps/v1' }],
            annotations: {
                'deployment.kubernetes.io/revision': revision,
                'kubernetes.io/change-cause': `cause ${revision}`,
            },
            creationTimestamp: new Date(NOW - Number(revision) * HOUR),
        },
        spec: {
            replicas: revision === '2' ? 3 : 0,
            template: { spec: { containers: [{ name: 'web', image: `nginx:1.2${revision}` }] } },
        },
        status: { replicas: revision === '2' ? 3 : 0, readyReplicas: revision === '2' ? 3 : 0 },
        ...overrides,
    } as V1ReplicaSet;
}

describe('deployment transforms', () => {
    it('derives status from replica counts', () => {
        expect(workloads.deploymentStatus(0, 0)).toBe('Available');
        expect(workloads.deploymentStatus(3, 3)).toBe('Healthy');
        expect(workloads.deploymentStatus(3, 4)).toBe('Healthy');
        expect(workloads.deploymentStatus(3, 2)).toBe('Progressing');
    });

    it('builds the row with ready ratio, counts, strategy and first image', () => {
        expect(workloads.toDeployment(deployment(), NOW)).toEqual({
            name: 'web',
            namespace: 'team-a',
            status: 'Progressing',
            ready: '2/3',
            replicas: 3,
            updated: 3,
            available: 2,
            strategy: 'Recreate',
            image: 'nginx:1.27',
            age: '3d',
        });
    });

    it('falls back to status replicas, RollingUpdate and dashes when the spec is sparse', () => {
        const bare = workloads.toDeployment(
            { metadata: { name: 'x' }, status: { replicas: 2, availableReplicas: 2 } },
            NOW,
        );
        expect(bare).toMatchObject({
            namespace: '',
            status: 'Healthy',
            ready: '0/2',
            replicas: 2,
            strategy: 'RollingUpdate',
            image: '—',
        });
    });

    it('adds label and annotation pairs on the detail, without the last-applied blob', () => {
        const detail = workloads.toDeploymentDetail(deployment(), NOW);
        expect(detail.labels).toEqual([['app', 'web']]);
        expect(detail.annotations).toEqual([['deployment.kubernetes.io/revision', '2']]);
    });

    it('keeps only the ReplicaSets the deployment owns', () => {
        const foreign = replicaSet('9', { metadata: { name: 'other', ownerReferences: [{ uid: 'else' } as never] } });
        expect(
            workloads.ownedReplicaSets(deployment(), [replicaSet('1'), foreign]).map((rs) => rs.metadata?.name),
        ).toEqual(['web-1']);
        expect(workloads.toReplicaSet(replicaSet('2'), NOW)).toEqual({
            name: 'web-2',
            desired: 3,
            current: 3,
            ready: 3,
            age: '2h',
        });
    });

    it('orders rollouts newest first and marks the deployment revision current', () => {
        const rollouts = workloads.toRollouts(deployment(), [replicaSet('1'), replicaSet('2')], NOW);
        expect(rollouts.map((r) => [r.rev, r.state, r.image, r.by])).toEqual([
            ['2', 'Current', 'nginx:1.22', 'cause 2'],
            ['1', 'Superseded', 'nginx:1.21', 'cause 1'],
        ]);
        expect(rollouts[0]?.when).toMatch(/ago|h/);
        const unannotated = replicaSet('0', {
            metadata: { name: 'plain', ownerReferences: [{ uid: 'dep-1' } as never] },
        });
        expect(workloads.toRollouts(deployment(), [unannotated], NOW)[0]).toMatchObject({
            rev: '0',
            state: 'Superseded',
            by: '—',
        });
    });
});

describe('statefulset and daemonset transforms', () => {
    it('builds the statefulset row and detail', () => {
        const s = {
            metadata: {
                name: 'db',
                namespace: 'team-a',
                creationTimestamp: new Date(NOW - HOUR),
                labels: { tier: 'db' },
            },
            spec: {
                replicas: 2,
                serviceName: 'db-headless',
                template: { spec: { containers: [{ name: 'pg', image: 'postgres:16' }] } },
            },
            status: { replicas: 2, readyReplicas: 2 },
        } as V1StatefulSet;
        expect(workloads.toStatefulSet(s, NOW)).toEqual({
            name: 'db',
            namespace: 'team-a',
            ready: '2/2',
            replicas: 2,
            service: 'db-headless',
            image: 'postgres:16',
            age: '1h',
        });
        expect(workloads.toStatefulSetDetail(s, NOW)).toMatchObject({ labels: [['tier', 'db']], annotations: [] });
        expect(workloads.toStatefulSet({ metadata: { name: 'x' } }, NOW)).toMatchObject({
            ready: '0/0',
            service: '—',
            image: '—',
        });
    });

    it('builds the daemonset row with scheduling counts and the node selector', () => {
        const d = {
            metadata: { name: 'agent', namespace: 'kube-system', creationTimestamp: new Date(NOW - 2 * HOUR) },
            spec: { template: { spec: { nodeSelector: { 'kubernetes.io/os': 'linux' } } } },
            status: { desiredNumberScheduled: 3, currentNumberScheduled: 3, numberReady: 2, updatedNumberScheduled: 3 },
        } as V1DaemonSet;
        expect(workloads.toDaemonSet(d, NOW)).toEqual({
            name: 'agent',
            namespace: 'kube-system',
            desired: 3,
            current: 3,
            ready: 2,
            upToDate: 3,
            nodeSelector: 'kubernetes.io/os=linux',
            age: '2h',
        });
        expect(workloads.toDaemonSetDetail(d, NOW)).toMatchObject({ labels: [], annotations: [] });
        expect(workloads.toDaemonSet({ metadata: { name: 'x' } }, NOW)).toMatchObject({
            desired: 0,
            nodeSelector: '<none>',
        });
    });
});

describe('readers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.getActiveNamespace.mockReturnValue('team-a');
        apps.listNamespacedDeployment.mockResolvedValue({ items: [deployment()] });
        apps.listDeploymentForAllNamespaces.mockResolvedValue({
            items: [deployment(), deployment({ metadata: { name: 'other', namespace: 'b' } })],
        });
        apps.readNamespacedDeployment.mockResolvedValue(deployment());
        apps.listNamespacedReplicaSet.mockResolvedValue({ items: [replicaSet('1'), replicaSet('2')] });
        apps.listNamespacedStatefulSet.mockResolvedValue({ items: [] });
        apps.listStatefulSetForAllNamespaces.mockResolvedValue({ items: [] });
        apps.readNamespacedStatefulSet.mockResolvedValue({ metadata: { name: 'db', namespace: 'team-a' } });
        apps.listNamespacedDaemonSet.mockResolvedValue({ items: [] });
        apps.listDaemonSetForAllNamespaces.mockResolvedValue({ items: [] });
        apps.readNamespacedDaemonSet.mockRejectedValue(new ApiException(404, 'x', null, {}));
    });

    it('lists deployments in the explicit, active or all namespaces', async () => {
        expect((await workloads.listDeployments('explicit')).map((d) => d.name)).toEqual(['web']);
        expect(apps.listNamespacedDeployment).toHaveBeenCalledWith({ namespace: 'explicit' });
        client.getActiveNamespace.mockReturnValue(null);
        expect((await workloads.listDeployments()).map((d) => d.namespace)).toEqual(['team-a', 'b']);
    });

    it('gets a deployment with its replicasets and rollouts, and returns empties for a missing one', async () => {
        await expect(workloads.getDeployment('web', 'team-a')).resolves.toMatchObject({
            name: 'web',
            labels: [['app', 'web']],
        });
        await expect(workloads.getDeploymentReplicaSets('web', 'team-a')).resolves.toHaveLength(2);
        expect(apps.listNamespacedReplicaSet).toHaveBeenCalledWith({ namespace: 'team-a' });
        const rollouts = await workloads.getDeploymentRollouts('web', 'team-a');
        expect(rollouts.map((r) => r.state)).toEqual(['Current', 'Superseded']);
        apps.readNamespacedDeployment.mockRejectedValue(new ApiException(404, 'x', null, {}));
        await expect(workloads.getDeployment('gone', 'team-a')).resolves.toBeNull();
        await expect(workloads.getDeploymentReplicaSets('gone', 'team-a')).resolves.toEqual([]);
        await expect(workloads.getDeploymentRollouts('gone', 'team-a')).resolves.toEqual([]);
    });

    it('lists and gets statefulsets and daemonsets through the same paths', async () => {
        await expect(workloads.listStatefulSets()).resolves.toEqual([]);
        expect(apps.listNamespacedStatefulSet).toHaveBeenCalledWith({ namespace: 'team-a' });
        await expect(workloads.getStatefulSet('db', 'team-a')).resolves.toMatchObject({ name: 'db' });
        await expect(workloads.listDaemonSets('kube-system')).resolves.toEqual([]);
        await expect(workloads.getDaemonSet('gone', 'team-a')).resolves.toBeNull();
        client.getActiveNamespace.mockReturnValue(null);
        await workloads.listDaemonSets();
        expect(apps.listDaemonSetForAllNamespaces).toHaveBeenCalled();
    });

    it('finds objects by name across namespaces when none is active', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        apps.listDeploymentForAllNamespaces.mockResolvedValue({ items: [deployment()] });
        apps.listStatefulSetForAllNamespaces.mockResolvedValue({
            items: [{ metadata: { name: 'db', namespace: 'x' } }],
        });
        apps.listDaemonSetForAllNamespaces.mockResolvedValue({ items: [] });
        await expect(workloads.getDeployment('web')).resolves.toMatchObject({ name: 'web' });
        expect(apps.listDeploymentForAllNamespaces).toHaveBeenCalledWith({ fieldSelector: 'metadata.name=web' });
        await expect(workloads.getStatefulSet('db')).resolves.toMatchObject({ name: 'db' });
        await expect(workloads.getDaemonSet('agent')).resolves.toBeNull();
        await expect(workloads.listStatefulSets()).resolves.toHaveLength(1);
        expect(apps.listStatefulSetForAllNamespaces).toHaveBeenCalledTimes(2);
    });

    it('returns no replicasets for a deployment without a namespace', async () => {
        apps.readNamespacedDeployment.mockResolvedValue(deployment({ metadata: { name: 'web', uid: 'dep-1' } }));
        await expect(workloads.getDeploymentReplicaSets('web', 'team-a')).resolves.toEqual([]);
        expect(apps.listNamespacedReplicaSet).not.toHaveBeenCalled();
    });

    it('classifies failures under the channel ops', async () => {
        apps.listNamespacedDeployment.mockRejectedValue(new ApiException(403, 'x', { message: 'denied' }, {}));
        await expect(workloads.listDeployments()).rejects.toMatchObject({ kind: 'forbidden', op: 'resources.list' });
        apps.listNamespacedReplicaSet.mockRejectedValue(new Error('boom'));
        await expect(workloads.getDeploymentRollouts('web', 'team-a')).rejects.toMatchObject({
            op: 'deployments.rollouts',
        });
    });
});
