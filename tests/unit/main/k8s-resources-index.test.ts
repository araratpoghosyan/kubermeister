import { describe, expect, it, vi } from 'vitest';

const podsMod = { listPods: vi.fn(), getPod: vi.fn() };
vi.mock('../../../src/main/k8s/resources/pods.js', () => podsMod);
const workloadsMod = {
    listDeployments: vi.fn(),
    getDeployment: vi.fn(),
    listStatefulSets: vi.fn(),
    getStatefulSet: vi.fn(),
    listDaemonSets: vi.fn(),
    getDaemonSet: vi.fn(),
};
vi.mock('../../../src/main/k8s/resources/workloads.js', () => workloadsMod);

const { listResources, getResource } = await import('../../../src/main/k8s/resources/index.js');

describe('generic resource dispatch', () => {
    it('routes list and get to the kind source and tags the output with the kind', async () => {
        podsMod.listPods.mockResolvedValue([{ name: 'web-1' }]);
        podsMod.getPod.mockResolvedValue(null);
        await expect(listResources({ kind: 'Pod', namespace: 'team-a' })).resolves.toEqual({
            kind: 'Pod',
            items: [{ name: 'web-1' }],
        });
        expect(podsMod.listPods).toHaveBeenCalledWith('team-a');
        await expect(getResource({ kind: 'Pod', name: 'web-1', namespace: 'team-a' })).resolves.toEqual({
            kind: 'Pod',
            item: null,
        });
        expect(podsMod.getPod).toHaveBeenCalledWith('web-1', 'team-a');
    });

    it('routes the workload kinds to their sources', async () => {
        workloadsMod.listDeployments.mockResolvedValue([{ name: 'web' }]);
        workloadsMod.getDeployment.mockResolvedValue({ name: 'web' });
        workloadsMod.listStatefulSets.mockResolvedValue([]);
        workloadsMod.getStatefulSet.mockResolvedValue(null);
        workloadsMod.listDaemonSets.mockResolvedValue([]);
        workloadsMod.getDaemonSet.mockResolvedValue(null);
        await expect(listResources({ kind: 'Deployment', namespace: 'a' })).resolves.toEqual({
            kind: 'Deployment',
            items: [{ name: 'web' }],
        });
        await expect(getResource({ kind: 'Deployment', name: 'web', namespace: 'a' })).resolves.toEqual({
            kind: 'Deployment',
            item: { name: 'web' },
        });
        await expect(listResources({ kind: 'StatefulSet' })).resolves.toEqual({ kind: 'StatefulSet', items: [] });
        await expect(getResource({ kind: 'StatefulSet', name: 'db' })).resolves.toEqual({
            kind: 'StatefulSet',
            item: null,
        });
        await expect(listResources({ kind: 'DaemonSet' })).resolves.toEqual({ kind: 'DaemonSet', items: [] });
        await expect(getResource({ kind: 'DaemonSet', name: 'agent' })).resolves.toEqual({
            kind: 'DaemonSet',
            item: null,
        });
    });
});
