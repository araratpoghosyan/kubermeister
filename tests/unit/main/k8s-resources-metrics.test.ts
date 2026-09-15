import { beforeEach, describe, expect, it, vi } from 'vitest';

const sampler = {
    ensureSampler: vi.fn(),
    clusterSparklines: vi.fn(),
    workloadHealth: vi.fn(),
    nodeSeries: vi.fn(),
    trackResourceSeries: vi.fn(),
};
vi.mock('../../../src/main/k8s/sampler.js', () => sampler);

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
});
