import { describe, expect, it, vi } from 'vitest';

const podsMod = { listPods: vi.fn(), getPod: vi.fn() };
vi.mock('../../../src/main/k8s/resources/pods.js', () => podsMod);

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
});
