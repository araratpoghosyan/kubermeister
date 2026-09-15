import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPodMetrics = vi.fn();
const getNodeMetrics = vi.fn();
vi.mock('@kubernetes/client-node', async () => ({
    ...(await vi.importActual<typeof import('@kubernetes/client-node')>('@kubernetes/client-node')),
    Metrics: class {
        getPodMetrics = getPodMetrics;
        getNodeMetrics = getNodeMetrics;
    },
}));
vi.mock('../../../src/main/k8s/client.js', () => ({ kubeConfig: () => ({}) }));

const { readPodUsage, readNodeUsage } = await import('../../../src/main/k8s/metrics.js');

describe('metrics-server reads', () => {
    beforeEach(() => {
        getPodMetrics.mockReset();
        getNodeMetrics.mockReset();
    });

    it('sums container usage per pod in millicores and MiB, tolerating sparse items', async () => {
        getPodMetrics.mockResolvedValue({
            items: [
                {
                    metadata: { namespace: 'team-a', name: 'web-1' },
                    containers: [{ usage: { cpu: '250m', memory: '64Mi' } }, { usage: { cpu: '1', memory: '1Gi' } }],
                },
                { metadata: { namespace: 'team-a', name: 'bare' } },
                { metadata: { namespace: 'team-a', name: 'partial' }, containers: [{}] },
            ],
        });
        const usage = await readPodUsage();
        expect(usage.get('team-a/web-1')).toEqual({ cpu: 1250, mem: 1088 });
        expect(usage.get('team-a/bare')).toEqual({ cpu: 0, mem: 0 });
        expect(usage.get('team-a/partial')).toEqual({ cpu: 0, mem: 0 });
    });

    it('reads node usage by name', async () => {
        getNodeMetrics.mockResolvedValue({
            items: [
                { metadata: { name: 'n1' }, usage: { cpu: '1500m', memory: '2048Mi' } },
                { metadata: { name: 'n2' } },
            ],
        });
        const usage = await readNodeUsage();
        expect(usage.get('n1')).toEqual({ cpu: 1500, mem: 2048 });
        expect(usage.get('n2')).toEqual({ cpu: 0, mem: 0 });
    });

    it('returns empty maps when metrics-server is absent or unreachable', async () => {
        getPodMetrics.mockRejectedValue(new Error('404'));
        getNodeMetrics.mockRejectedValue(new Error('ECONNREFUSED'));
        expect((await readPodUsage()).size).toBe(0);
        expect((await readNodeUsage()).size).toBe(0);
    });
});
