import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeInformer extends EventEmitter {
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
const client = {
    kubeConfig: () => ({ fake: true }),
    apis: () => ({ core: { listNamespacedPod, listPodForAllNamespaces } }),
    resolveNamespace: (explicit?: string) => explicit ?? 'team-a',
};
vi.mock('../../../src/main/k8s/client.js', () => client);

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

    it('rejects an invalid input before touching the cluster', async () => {
        await expect(startResourceWatch({ kind: 'Deployment' }, vi.fn())).rejects.toThrow();
        expect(makeInformer).not.toHaveBeenCalled();
    });
});
