import { beforeEach, describe, expect, it, vi } from 'vitest';

const sampler = {
    ensureSampler: vi.fn(),
    clusterSparklines: vi.fn(),
    workloadHealth: vi.fn(),
    nodeSeries: vi.fn(),
    trackResourceSeries: vi.fn(),
};
vi.mock('../../../src/main/k8s/sampler.js', () => sampler);
const apps = { readNamespacedDeployment: vi.fn() };
const core = { listNamespacedPod: vi.fn() };
vi.mock('../../../src/main/k8s/client.js', () => ({
    apis: () => ({ apps, core }),
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch {
            return undefined;
        }
    },
}));

const metrics = await import('../../../src/main/k8s/resources/metrics.js');

describe('metrics readers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('start the sampler and hand back its series', async () => {
        sampler.clusterSparklines.mockReturnValue({ nodes: [1], cpu: [2], mem: [3] });
        sampler.workloadHealth.mockReturnValue([{ t: 1, cpu: 2, mem: 3 }]);
        sampler.nodeSeries.mockReturnValue({ cpu: [4], mem: [5] });
        sampler.trackResourceSeries.mockReturnValue({ cpu: [6], mem: [7] });
        await expect(metrics.getSparklines()).resolves.toEqual({ nodes: [1], cpu: [2], mem: [3] });
        await expect(metrics.getWorkloadHealth()).resolves.toEqual([{ t: 1, cpu: 2, mem: 3 }]);
        await expect(metrics.getNodeSeries('n1')).resolves.toEqual({ cpu: [4], mem: [5] });
        await expect(metrics.getPodSeries('team-a', 'web-1')).resolves.toEqual({ cpu: [6], mem: [7] });
        expect(sampler.nodeSeries).toHaveBeenCalledWith('n1');
        expect(sampler.trackResourceSeries).toHaveBeenCalledWith('team-a', 'web-1');
        expect(sampler.ensureSampler).toHaveBeenCalledTimes(4);
    });

    it('sums series tail-aligned to the shortest non-empty one', () => {
        expect(metrics.sumSeries([])).toEqual({ cpu: [], mem: [] });
        expect(metrics.sumSeries([{ cpu: [], mem: [] }])).toEqual({ cpu: [], mem: [] });
        expect(
            metrics.sumSeries([
                { cpu: [1, 2, 3], mem: [10, 20, 30] },
                { cpu: [5], mem: [50] },
                { cpu: [], mem: [] },
            ]),
        ).toEqual({ cpu: [8], mem: [80] });
    });

    it('sums the tracked series of the pods a deployment selects', async () => {
        apps.readNamespacedDeployment.mockResolvedValue({
            spec: { selector: { matchLabels: { app: 'web', tier: 'fe' } } },
        });
        core.listNamespacedPod.mockResolvedValue({
            items: [{ metadata: { name: 'web-1' } }, { metadata: { name: 'web-2' } }],
        });
        sampler.trackResourceSeries.mockImplementation((_ns: string, name: string) =>
            name === 'web-1' ? { cpu: [1, 2], mem: [3, 4] } : { cpu: [10], mem: [30] },
        );
        await expect(metrics.getDeploymentSeries('team-a', 'web')).resolves.toEqual({ cpu: [12], mem: [34] });
        expect(core.listNamespacedPod).toHaveBeenCalledWith({ namespace: 'team-a', labelSelector: 'app=web,tier=fe' });
        expect(sampler.trackResourceSeries).toHaveBeenCalledWith('team-a', 'web-1');
        apps.readNamespacedDeployment.mockRejectedValue(new Error('404'));
        await expect(metrics.getDeploymentSeries('team-a', 'gone')).resolves.toEqual({ cpu: [], mem: [] });
    });
});
