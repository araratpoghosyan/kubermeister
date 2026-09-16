import type { V1Node, V1Pod } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const listPodForAllNamespaces = vi.fn();
const listNode = vi.fn();
const listJobForAllNamespaces = vi.fn();
const listPersistentVolumeClaimForAllNamespaces = vi.fn();
vi.mock('../../../src/main/k8s/client.js', () => ({
    apis: () => ({
        core: { listPodForAllNamespaces, listNode, listPersistentVolumeClaimForAllNamespaces },
        batch: { listJobForAllNamespaces },
    }),
}));
vi.mock('../../../src/main/k8s/sampler.js', () => ({
    ensureSampler: vi.fn(),
    podUsage: vi.fn(),
    containerUsage: vi.fn(),
    percent: vi.fn(),
}));

const alerts = await import('../../../src/main/k8s/alerts.js');

function pod(
    name: string,
    phase: string,
    extra: { waiting?: string; restarts?: number; deleting?: boolean } = {},
): V1Pod {
    return {
        metadata: { name, namespace: 'team-a', deletionTimestamp: extra.deleting ? new Date() : undefined },
        spec: { containers: [{ name: 'c' }] },
        status: {
            phase,
            containerStatuses: [
                {
                    name: 'c',
                    ready: phase === 'Running',
                    restartCount: extra.restarts ?? 0,
                    image: 'x',
                    imageID: 'x',
                    state: extra.waiting ? { waiting: { reason: extra.waiting } } : { running: {} },
                },
            ],
        },
    } as V1Pod;
}
function node(name: string, ready: boolean, unschedulable = false): V1Node {
    return {
        metadata: { name },
        spec: { unschedulable },
        status: { conditions: [{ type: 'Ready', status: ready ? 'True' : 'False' }] },
    } as V1Node;
}

describe('alerts', () => {
    beforeEach(() => {
        listPodForAllNamespaces.mockReset();
        listNode.mockReset();
        listNode.mockResolvedValue({ items: [] });
        listPodForAllNamespaces.mockResolvedValue({ items: [] });
        listJobForAllNamespaces.mockReset();
        listJobForAllNamespaces.mockResolvedValue({ items: [] });
        listPersistentVolumeClaimForAllNamespaces.mockReset();
        listPersistentVolumeClaimForAllNamespaces.mockResolvedValue({ items: [] });
    });

    it('derives pod alerts by status and restarts across all namespaces', async () => {
        listPodForAllNamespaces.mockResolvedValue({
            items: [
                pod('crash', 'Running', { waiting: 'CrashLoopBackOff', restarts: 12 }),
                pod('pull', 'Pending', { waiting: 'ErrImagePull' }),
                pod('dead', 'Failed'),
                pod('wait', 'Pending'),
                pod('flaky', 'Running', { restarts: 5 }),
                pod('fine', 'Running', { restarts: 4 }),
            ],
        });
        const result = await alerts.podAlerts();
        expect(result).toEqual([
            { tone: 'danger', title: 'CrashLoopBackOff: crash', detail: '12 restarts — team-a/crash' },
            { tone: 'danger', title: 'Image pull failure: pull', detail: 'team-a/pull' },
            { tone: 'danger', title: 'Pod failed: dead', detail: 'team-a/dead' },
            { tone: 'warn', title: 'Pod pending: wait', detail: 'team-a/wait' },
            { tone: 'warn', title: 'High restarts: flaky', detail: '5 restarts — team-a/flaky' },
        ]);
    });

    it('derives node alerts, with NotReady outranking cordoned', async () => {
        listNode.mockResolvedValue({ items: [node('a', true), node('b', false, true), node('c', true, true)] });
        expect(await alerts.nodeAlerts()).toEqual([
            { tone: 'danger', title: 'Node NotReady: b', detail: 'Ready condition is not True' },
            { tone: 'warn', title: 'Node cordoned: c', detail: 'Scheduling disabled' },
        ]);
    });

    it('sorts danger first, caps the list, and survives a failing source', async () => {
        listPodForAllNamespaces.mockResolvedValue({
            items: Array.from({ length: 30 }, (_, i) => pod(`p${i}`, 'Pending')),
        });
        listNode.mockRejectedValue(new Error('forbidden'));
        const result = await alerts.listAlerts();
        expect(result).toHaveLength(alerts.MAX_ALERTS);
        expect(result.every((a) => a.tone === 'warn')).toBe(true);

        listPodForAllNamespaces.mockResolvedValue({ items: [pod('wait', 'Pending')] });
        listNode.mockResolvedValue({ items: [node('b', false)] });
        expect((await alerts.listAlerts()).map((a) => a.tone)).toEqual(['danger', 'warn']);
    });

    it('reports failed jobs with their completion ratio', async () => {
        listJobForAllNamespaces.mockResolvedValue({
            items: [
                {
                    metadata: { name: 'import', namespace: 'team-a' },
                    spec: { completions: 3 },
                    status: { succeeded: 1, conditions: [{ type: 'Failed', status: 'True' }] },
                },
                {
                    metadata: { name: 'ok', namespace: 'team-a' },
                    status: { conditions: [{ type: 'Complete', status: 'True' }] },
                },
            ],
        });
        expect(await alerts.jobAlerts()).toEqual([
            { tone: 'danger', title: 'Job failed: import', detail: 'completions 1/3 — team-a/import' },
        ]);
        listJobForAllNamespaces.mockRejectedValue(new Error('forbidden'));
        expect(await alerts.jobAlerts()).toEqual([]);
    });

    it('reports claims that are pending or lost', async () => {
        listPersistentVolumeClaimForAllNamespaces.mockResolvedValue({
            items: [
                {
                    metadata: { name: 'data', namespace: 'team-a' },
                    spec: { storageClassName: 'local-path' },
                    status: { phase: 'Pending' },
                },
                { metadata: { name: 'gone', namespace: 'team-a' }, spec: {}, status: { phase: 'Lost' } },
                { metadata: { name: 'ok', namespace: 'team-a' }, spec: {}, status: { phase: 'Bound' } },
            ],
        });
        expect(await alerts.claimAlerts()).toEqual([
            { tone: 'warn', title: 'PVC Pending: data', detail: 'local-path — team-a/data' },
            { tone: 'danger', title: 'PVC Lost: gone', detail: '— — team-a/gone' },
        ]);
        listPersistentVolumeClaimForAllNamespaces.mockRejectedValue(new Error('denied'));
        expect(await alerts.claimAlerts()).toEqual([]);
    });
});
