import type { V1LimitRange, V1ResourceQuota } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = {
    listNamespacedResourceQuota: vi.fn(),
    listResourceQuotaForAllNamespaces: vi.fn(),
    listNamespacedLimitRange: vi.fn(),
    listLimitRangeForAllNamespaces: vi.fn(),
};
const client = {
    apis: () => ({ core }),
    getActiveNamespace: vi.fn<() => string | null>(),
    listItems: async <T>(
        ns: string | undefined,
        namespaced: (ns: string) => Promise<{ items: T[] }>,
        all: () => Promise<{ items: T[] }>,
    ) => {
        const resolved = ns ?? client.getActiveNamespace() ?? undefined;
        return resolved ? namespaced(resolved) : all();
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);

const overview = await import('../../../src/main/k8s/resources/overview.js');

const quota = (overrides: Partial<V1ResourceQuota> = {}): V1ResourceQuota =>
    ({
        metadata: { name: 'team-quota', namespace: 'team-a' },
        status: {
            hard: { 'requests.cpu': '4', 'requests.memory': '8Gi', pods: '20' },
            used: { 'requests.cpu': '1', 'requests.memory': '2Gi', pods: '5' },
        },
        ...overrides,
    }) as V1ResourceQuota;

describe('quota rows', () => {
    it('emits one row per hard resource with usage and remaining', () => {
        expect(overview.toResourceQuotaRows(quota())).toEqual([
            {
                namespace: 'team-a',
                name: 'team-quota',
                resource: 'requests.cpu',
                used: '1',
                hard: '4',
                remaining: '3',
                usage: 25,
            },
            {
                namespace: 'team-a',
                name: 'team-quota',
                resource: 'requests.memory',
                used: '2Gi',
                hard: '8Gi',
                remaining: '6.0 GiB',
                usage: 25,
            },
            {
                namespace: 'team-a',
                name: 'team-quota',
                resource: 'pods',
                used: '5',
                hard: '20',
                remaining: '15',
                usage: 25,
            },
        ]);
    });

    it('falls back to the spec, treats missing usage as zero and never divides by zero', () => {
        const spec = quota({ metadata: { name: 'q', namespace: 'a' }, spec: { hard: { pods: '10' } }, status: {} });
        expect(overview.toResourceQuotaRows(spec)).toEqual([
            { namespace: 'a', name: 'q', resource: 'pods', used: '0', hard: '10', remaining: '10', usage: 0 },
        ]);
        const zero = quota({ status: { hard: { pods: '0' }, used: { pods: '0' } } });
        expect(overview.toResourceQuotaRows(zero)[0]?.usage).toBe(0);
        expect(overview.toResourceQuotaRows({ metadata: {} })).toEqual([]);
    });
});

const limitRange = (overrides: Partial<V1LimitRange> = {}): V1LimitRange =>
    ({
        metadata: { name: 'team-limits', namespace: 'team-a' },
        spec: {
            limits: [
                {
                    type: 'Container',
                    min: { cpu: '100m' },
                    defaultRequest: { cpu: '200m' },
                    _default: { cpu: '500m', memory: '256Mi' },
                    max: { cpu: '2' },
                    maxLimitRequestRatio: { cpu: '4' },
                },
            ],
        },
        ...overrides,
    }) as unknown as V1LimitRange;

describe('limit range rows', () => {
    it('emits one row per resource named anywhere in the limit, dashing what is absent', () => {
        expect(overview.toLimitRangeRows(limitRange())).toEqual([
            {
                namespace: 'team-a',
                name: 'team-limits',
                type: 'Container',
                resource: 'cpu',
                min: '100m',
                defaultRequest: '200m',
                defaultLimit: '500m',
                max: '2',
                maxRatio: '4',
            },
            {
                namespace: 'team-a',
                name: 'team-limits',
                type: 'Container',
                resource: 'memory',
                min: '—',
                defaultRequest: '—',
                defaultLimit: '256Mi',
                max: '—',
                maxRatio: '—',
            },
        ]);
        expect(overview.toLimitRangeRows({ metadata: {}, spec: { limits: [] } })).toEqual([]);
        expect(overview.toLimitRangeRows({ metadata: {} })).toEqual([]);
    });
});

describe('overview readers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        client.getActiveNamespace.mockReturnValue('team-a');
        core.listNamespacedResourceQuota.mockResolvedValue({ items: [quota()] });
        core.listResourceQuotaForAllNamespaces.mockResolvedValue({ items: [] });
        core.listNamespacedLimitRange.mockResolvedValue({ items: [limitRange()] });
        core.listLimitRangeForAllNamespaces.mockResolvedValue({ items: [] });
    });

    it('reads the explicit, active or all namespaces and flattens the rows', async () => {
        expect(await overview.listQuotas('explicit')).toHaveLength(3);
        expect(core.listNamespacedResourceQuota).toHaveBeenCalledWith({ namespace: 'explicit' });
        expect(await overview.listLimits()).toHaveLength(2);
        expect(core.listNamespacedLimitRange).toHaveBeenCalledWith({ namespace: 'team-a' });
        client.getActiveNamespace.mockReturnValue(null);
        expect(await overview.listQuotas()).toEqual([]);
        expect(core.listResourceQuotaForAllNamespaces).toHaveBeenCalled();
    });

    it('classifies failures under their channel ops', async () => {
        core.listNamespacedResourceQuota.mockRejectedValue(Object.assign(new Error('x'), { code: 401 }));
        await expect(overview.listQuotas()).rejects.toMatchObject({ kind: 'unauthorized', op: 'quotas.list' });
        core.listNamespacedLimitRange.mockRejectedValue(Object.assign(new Error('x'), { code: 401 }));
        await expect(overview.listLimits()).rejects.toMatchObject({ op: 'limits.list' });
    });
});
