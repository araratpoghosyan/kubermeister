import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeInformer extends EventEmitter {
    constructor() {
        // One fake informer is shared by every watch a test starts; the listener count is expected.
        super({ captureRejections: false });
        this.setMaxListeners(0);
    }
    start = vi.fn(async () => {});
    stop = vi.fn(async () => {});
}
let informer = new FakeInformer();
const makeInformer = vi.fn(() => informer);
vi.mock('@kubernetes/client-node', async () => ({
    ...(await vi.importActual<typeof import('@kubernetes/client-node')>('@kubernetes/client-node')),
    makeInformer,
}));

const listNamespacedPod = vi.fn(async () => ({ items: [] }));
const listPodForAllNamespaces = vi.fn(async () => ({ items: [] }));
const listNamespacedDeployment = vi.fn(async () => ({ items: [] }));
const listDeploymentForAllNamespaces = vi.fn(async () => ({ items: [] }));
const listNamespacedStatefulSet = vi.fn(async () => ({ items: [] }));
const listStatefulSetForAllNamespaces = vi.fn(async () => ({ items: [] }));
const listNamespacedDaemonSet = vi.fn(async () => ({ items: [] }));
const listAny = vi.fn(async () => ({ items: [] }));
const listNamespacedJob = vi.fn(async () => ({ items: [] }));
const listCronJobForAllNamespaces = vi.fn(async () => ({ items: [] }));
const listNamespacedHorizontalPodAutoscaler = vi.fn(async () => ({ items: [] }));
const listDaemonSetForAllNamespaces = vi.fn(async () => ({ items: [] }));
const client = {
    kubeConfig: () => ({ fake: true }),
    apis: () => ({
        core: {
            listPersistentVolume: listAny,
            listNamespacedPersistentVolumeClaim: listAny,
            listPersistentVolumeClaimForAllNamespaces: listAny,
            listNamespacedPod,
            listPodForAllNamespaces,
            listNamespacedConfigMap: listAny,
            listConfigMapForAllNamespaces: listAny,
            listNamespacedSecret: listAny,
            listSecretForAllNamespaces: listAny,
            listNamespacedService: listAny,
            listServiceForAllNamespaces: listAny,
            listNamespacedEndpoints: listAny,
            listEndpointsForAllNamespaces: listAny,
            listNamespacedServiceAccount: listAny,
            listServiceAccountForAllNamespaces: listAny,
        },
        apps: {
            listNamespacedDeployment,
            listDeploymentForAllNamespaces,
            listNamespacedStatefulSet,
            listStatefulSetForAllNamespaces,
            listNamespacedDaemonSet,
            listDaemonSetForAllNamespaces,
        },
        batch: {
            listNamespacedJob,
            listJobForAllNamespaces: listAny,
            listNamespacedCronJob: listAny,
            listCronJobForAllNamespaces,
        },
        hpa: {
            listNamespacedHorizontalPodAutoscaler,
            listHorizontalPodAutoscalerForAllNamespaces: listAny,
        },
        storage: { listStorageClass: listAny },
        apiextensions: { listCustomResourceDefinition: listAny },
        rbac: {
            listNamespacedRole: listAny,
            listRoleForAllNamespaces: listAny,
            listNamespacedRoleBinding: listAny,
            listRoleBindingForAllNamespaces: listAny,
            listClusterRole: listAny,
            listClusterRoleBinding: listAny,
        },
        net: {
            listNamespacedIngress: listAny,
            listIngressForAllNamespaces: listAny,
            listNamespacedNetworkPolicy: listAny,
            listNetworkPolicyForAllNamespaces: listAny,
        },
    }),
    resolveNamespace: (explicit?: string) => explicit ?? 'team-a',
};
vi.mock('../../../src/main/k8s/client.js', () => client);
const sampler = { ensureSampler: vi.fn(), podUsage: vi.fn(() => ({ cpu: 7, mem: 9 })) };
vi.mock('../../../src/main/k8s/sampler.js', () => sampler);

const { startResourceWatch, WATCH_RETRY_MS } = await import('../../../src/main/k8s/watch.js');

const pod = (name: string) => ({
    metadata: { name, namespace: 'team-a' },
    spec: { containers: [] },
    status: { phase: 'Running' },
});

describe('startResourceWatch', () => {
    beforeEach(() => {
        informer = new FakeInformer();
        makeInformer.mockClear();
        vi.useFakeTimers();
    });
    afterEach(() => vi.useRealTimers());

    it('refuses a malformed namespace before it can reach the watch path', async () => {
        for (const namespace of ['', 'a/pods/../deployments', 'Team-A', 'a?watch=false']) {
            await expect(startResourceWatch({ kind: 'Pod', namespace }, vi.fn())).rejects.toThrow();
        }
        expect(makeInformer).not.toHaveBeenCalled();
    });

    it('watches the resolved namespace path with the matching list function', async () => {
        const send = vi.fn();
        await startResourceWatch({ kind: 'Pod', namespace: 'explicit' }, send);
        expect(makeInformer).toHaveBeenCalledWith(
            { fake: true },
            '/api/v1/namespaces/explicit/pods',
            expect.any(Function),
        );
        await (makeInformer.mock.calls[0] as unknown[])[2]!();
        expect(listNamespacedPod).toHaveBeenCalledWith({ namespace: 'explicit' });
        expect(informer.start).toHaveBeenCalledOnce();
    });

    it('falls back to the active namespace, or all namespaces when none is active', async () => {
        await startResourceWatch({ kind: 'Pod' }, vi.fn());
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/api/v1/namespaces/team-a/pods',
            expect.any(Function),
        );
        client.resolveNamespace = () => undefined;
        await startResourceWatch({ kind: 'Pod' }, vi.fn());
        expect(makeInformer).toHaveBeenLastCalledWith(expect.anything(), '/api/v1/pods', expect.any(Function));
        await (makeInformer.mock.calls[1] as unknown[])[2]!();
        expect(listPodForAllNamespaces).toHaveBeenCalled();
        client.resolveNamespace = (explicit?: string) => explicit ?? 'team-a';
    });

    it('translates informer events into typed watch events with the row transform', async () => {
        const send = vi.fn();
        await startResourceWatch({ kind: 'Pod' }, send);
        informer.emit('add', pod('web-1'));
        informer.emit('update', pod('web-1'));
        informer.emit('delete', pod('web-1'));
        expect(send.mock.calls.map((c) => c[0].data.type)).toEqual(['added', 'modified', 'deleted']);
        expect(send.mock.calls[0]![0]).toMatchObject({
            type: 'data',
            data: { kind: 'Pod', item: { name: 'web-1', namespace: 'team-a', status: 'Running' } },
        });
    });

    it('reports an informer error and restarts after the retry delay while active', async () => {
        const send = vi.fn();
        const { stop } = await startResourceWatch({ kind: 'Pod' }, send);
        informer.emit('error', new Error('watch closed'));
        expect(send).toHaveBeenCalledWith({ type: 'error', message: 'watch closed' });
        expect(informer.start).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(WATCH_RETRY_MS);
        expect(informer.start).toHaveBeenCalledTimes(2);
        stop();
        informer.emit('error', 'later');
        expect(send).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(WATCH_RETRY_MS);
        expect(informer.start).toHaveBeenCalledTimes(2);
        expect(informer.stop).toHaveBeenCalledOnce();
    });

    it('stops emitting after stop and cancels a pending retry', async () => {
        const send = vi.fn();
        const { stop } = await startResourceWatch({ kind: 'Pod' }, send);
        informer.emit('error', new Error('x'));
        stop();
        await vi.advanceTimersByTimeAsync(WATCH_RETRY_MS);
        informer.emit('add', pod('late'));
        expect(informer.start).toHaveBeenCalledTimes(1);
        expect(send.mock.calls.filter((c) => c[0].type === 'data')).toHaveLength(0);
    });

    it('watches the workload kinds on their apps paths with their row transforms', async () => {
        const send = vi.fn();
        await startResourceWatch({ kind: 'Deployment', namespace: 'team-a' }, send);
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/apis/apps/v1/namespaces/team-a/deployments',
            expect.any(Function),
        );
        await (makeInformer.mock.calls[0] as unknown[])[2]!();
        expect(listNamespacedDeployment).toHaveBeenCalledWith({ namespace: 'team-a' });
        informer.emit('add', {
            metadata: { name: 'web', namespace: 'team-a' },
            spec: { replicas: 1 },
            status: { availableReplicas: 1 },
        });
        expect(send.mock.calls[0]![0]).toMatchObject({
            data: { kind: 'Deployment', type: 'added', item: { name: 'web', status: 'Healthy', ready: '0/1' } },
        });

        client.resolveNamespace = () => undefined;
        await startResourceWatch({ kind: 'DaemonSet' }, vi.fn());
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/apis/apps/v1/daemonsets',
            expect.any(Function),
        );
        await (makeInformer.mock.calls[1] as unknown[])[2]!();
        expect(listDaemonSetForAllNamespaces).toHaveBeenCalled();
        client.resolveNamespace = (explicit?: string) => explicit ?? 'team-a';
        await startResourceWatch({ kind: 'StatefulSet' }, vi.fn());
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/apis/apps/v1/namespaces/team-a/statefulsets',
            expect.any(Function),
        );
    });

    it('uses the namespaced or cluster-wide list for every workload kind', async () => {
        const listOf = async (index: number) =>
            (makeInformer.mock.calls[index] as unknown[])[2] as () => Promise<unknown>;
        await startResourceWatch({ kind: 'StatefulSet', namespace: 'team-a' }, vi.fn());
        await (
            await listOf(0)
        )();
        expect(listNamespacedStatefulSet).toHaveBeenCalledWith({ namespace: 'team-a' });
        await startResourceWatch({ kind: 'DaemonSet', namespace: 'team-a' }, vi.fn());
        await (
            await listOf(1)
        )();
        expect(listNamespacedDaemonSet).toHaveBeenCalledWith({ namespace: 'team-a' });
        client.resolveNamespace = () => undefined;
        await startResourceWatch({ kind: 'Deployment' }, vi.fn());
        await (
            await listOf(2)
        )();
        expect(listDeploymentForAllNamespaces).toHaveBeenCalled();
        await startResourceWatch({ kind: 'StatefulSet' }, vi.fn());
        await (
            await listOf(3)
        )();
        expect(listStatefulSetForAllNamespaces).toHaveBeenCalled();
        client.resolveNamespace = (explicit?: string) => explicit ?? 'team-a';

        const send = vi.fn();
        await startResourceWatch({ kind: 'StatefulSet' }, send);
        informer.emit('add', {
            metadata: { name: 'db', namespace: 'team-a' },
            spec: { replicas: 1, serviceName: 'db' },
        });
        expect(send.mock.calls[0]![0]).toMatchObject({
            data: { kind: 'StatefulSet', item: { name: 'db', service: 'db' } },
        });
        await startResourceWatch({ kind: 'DaemonSet' }, send);
        informer.emit('add', { metadata: { name: 'agent', namespace: 'team-a' }, status: { numberReady: 2 } });
        // Both watches share the fake informer, so the second emit reaches both listeners; the
        // DaemonSet's send is the last one.
        expect(send.mock.calls.at(-1)![0]).toMatchObject({
            data: { kind: 'DaemonSet', item: { name: 'agent', ready: 2 } },
        });
    });

    it('watches the batch and autoscaler kinds on their own API paths', async () => {
        const listOf = (index: number) => (makeInformer.mock.calls[index] as unknown[])[2] as () => Promise<unknown>;
        const send = vi.fn();
        await startResourceWatch({ kind: 'Job', namespace: 'team-a' }, send);
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/apis/batch/v1/namespaces/team-a/jobs',
            expect.any(Function),
        );
        await listOf(0)();
        expect(listNamespacedJob).toHaveBeenCalledWith({ namespace: 'team-a' });
        informer.emit('add', {
            metadata: { name: 'import', namespace: 'team-a' },
            status: { conditions: [{ type: 'Complete', status: 'True' }] },
        });
        expect(send.mock.calls.at(-1)![0]).toMatchObject({
            data: { kind: 'Job', type: 'added', item: { name: 'import', status: 'Complete' } },
        });

        client.resolveNamespace = () => undefined;
        await startResourceWatch({ kind: 'CronJob' }, vi.fn());
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/apis/batch/v1/cronjobs',
            expect.any(Function),
        );
        await listOf(1)();
        expect(listCronJobForAllNamespaces).toHaveBeenCalled();
        client.resolveNamespace = (explicit?: string) => explicit ?? 'team-a';

        await startResourceWatch({ kind: 'HorizontalPodAutoscaler' }, vi.fn());
        expect(makeInformer).toHaveBeenLastCalledWith(
            expect.anything(),
            '/apis/autoscaling/v2/namespaces/team-a/horizontalpodautoscalers',
            expect.any(Function),
        );
        await listOf(2)();
        expect(listNamespacedHorizontalPodAutoscaler).toHaveBeenCalledWith({ namespace: 'team-a' });
    });

    it('gives every registered kind a namespaced path, a cluster-wide path and a row transform', async () => {
        const { KINDS, kindInfo } = await import('../../../src/shared/k8s/registry.js');
        // VolumeSnapshot is polled: a cluster need not have its CRD, so it has no watch source.
        const watched = KINDS.filter((kind) => kind !== 'VolumeSnapshot');
        // roleRef is required on both binding kinds, so the shared fixture carries one.
        const object = {
            metadata: { name: 'x', namespace: 'team-a' },
            spec: {},
            status: {},
            roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'reader' },
        };
        for (const [index, kind] of watched.entries()) {
            const clusterScoped = kindInfo(kind).clusterScoped;
            const send = vi.fn();
            await startResourceWatch({ kind, namespace: 'team-a' }, send);
            const [, namespacedPath, list] = makeInformer.mock.calls[index * 2] as [
                unknown,
                string,
                () => Promise<unknown>,
            ];
            expect(clusterScoped ? true : namespacedPath.includes('/namespaces/team-a/')).toBe(true);
            await expect(list()).resolves.toEqual({ items: [] });
            informer.emit('add', object);
            expect(send.mock.calls.at(-1)![0]).toMatchObject({ data: { kind, type: 'added', item: { name: 'x' } } });

            client.resolveNamespace = () => undefined;
            await startResourceWatch({ kind }, vi.fn());
            const [, clusterPath, listAll] = makeInformer.mock.calls[index * 2 + 1] as [
                unknown,
                string,
                () => Promise<unknown>,
            ];
            expect(clusterPath).not.toContain('/namespaces/');
            await expect(listAll()).resolves.toEqual({ items: [] });
            client.resolveNamespace = (explicit?: string) => explicit ?? 'team-a';
        }
    });

    it('refuses to watch a kind that has no watch source', async () => {
        await expect(startResourceWatch({ kind: 'VolumeSnapshot' }, vi.fn())).rejects.toMatchObject({
            kind: 'invalid',
            op: 'resources.watch',
        });
        expect(makeInformer).not.toHaveBeenCalled();
    });

    it('rejects an invalid input before touching the cluster', async () => {
        await expect(startResourceWatch({ kind: 'Nope' }, vi.fn())).rejects.toThrow();
        expect(makeInformer).not.toHaveBeenCalled();
    });
});
