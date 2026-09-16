import { ApiException, type V1APIService, type V1FlowSchema } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiregistration = { listAPIService: vi.fn(), readAPIService: vi.fn() };
const flowcontrol = { listFlowSchema: vi.fn(), readFlowSchema: vi.fn() };
const client = {
    apis: () => ({ apiregistration, flowcontrol }),
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ApiException && error.code === 404) return undefined;
            throw error;
        }
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);

const apiserver = await import('../../../src/main/k8s/resources/apiserver.js');

const NOW = Date.parse('2026-09-16T12:00:00Z');
const HOUR = 3600 * 1000;

describe('api service transforms', () => {
    const aggregated: V1APIService = {
        metadata: { name: 'v1beta1.metrics.k8s.io', creationTimestamp: new Date(NOW - HOUR) },
        spec: {
            group: 'metrics.k8s.io',
            version: 'v1beta1',
            groupPriorityMinimum: 100,
            versionPriority: 100,
            service: { namespace: 'kube-system', name: 'metrics-server', port: 443 },
        },
        status: { conditions: [{ type: 'Available', status: 'True', lastTransitionTime: new Date(NOW) }] },
    };

    it('names the service behind an aggregated API and reports it available', () => {
        expect(apiserver.toApiService(aggregated, NOW)).toEqual({
            name: 'v1beta1.metrics.k8s.io',
            status: 'Available',
            group: 'metrics.k8s.io',
            version: 'v1beta1',
            service: 'kube-system/metrics-server',
            reason: '—',
            age: '1h',
        });
        expect(apiserver.toApiServiceDetail(aggregated, NOW)).toMatchObject({ labels: [], annotations: [] });
    });

    it('carries the reason when the backing service is down, which is why its kinds vanish', () => {
        const broken: V1APIService = {
            ...aggregated,
            status: {
                conditions: [
                    {
                        type: 'Available',
                        status: 'False',
                        reason: 'FailedDiscoveryCheck',
                        message: 'no endpoints available',
                        lastTransitionTime: new Date(NOW),
                    },
                ],
            },
        };
        expect(apiserver.toApiService(broken, NOW)).toMatchObject({
            status: 'Unavailable',
            reason: 'no endpoints available',
        });
        // Without a message the API server's reason stands in for it.
        const terse = {
            ...broken,
            status: { conditions: [{ type: 'Available', status: 'False', reason: 'ServiceNotFound' }] },
        } as V1APIService;
        expect(apiserver.toApiService(terse, NOW).reason).toBe('ServiceNotFound');
    });

    it('reads an API the server serves itself as Local, and no conditions as unavailable', () => {
        expect(
            apiserver.toApiService({ metadata: { name: 'v1.' }, spec: { version: 'v1' } } as V1APIService, NOW),
        ).toEqual({
            name: 'v1.',
            status: 'Unavailable',
            group: '—',
            version: 'v1',
            service: 'Local',
            reason: '—',
            age: '—',
        });
    });
});

describe('flow schema transforms', () => {
    const schema: V1FlowSchema = {
        metadata: { name: 'workload-high', creationTimestamp: new Date(NOW - 3 * HOUR) },
        spec: {
            priorityLevelConfiguration: { name: 'workload-high' },
            matchingPrecedence: 800,
            distinguisherMethod: { type: 'ByUser' },
        },
    };

    it('names the level it feeds and how it is ordered against other schemas', () => {
        expect(apiserver.toFlowSchema(schema, NOW)).toEqual({
            name: 'workload-high',
            priorityLevel: 'workload-high',
            matchingPrecedence: 800,
            distinguisher: 'ByUser',
            age: '3h',
        });
        expect(apiserver.toFlowSchemaDetail(schema, NOW)).toMatchObject({ labels: [] });
    });

    it('falls back to the precedence the API server itself assumes', () => {
        expect(apiserver.toFlowSchema({ metadata: { name: 'bare' } }, NOW)).toEqual({
            name: 'bare',
            priorityLevel: '—',
            matchingPrecedence: 1000,
            distinguisher: '—',
            age: '—',
        });
    });
});

describe('api server readers', () => {
    beforeEach(() => {
        for (const api of [apiregistration, flowcontrol]) for (const fn of Object.values(api)) fn.mockReset();
    });

    it('lists and reads both kinds cluster-wide', async () => {
        apiregistration.listAPIService.mockResolvedValue({ items: [{ metadata: { name: 'v1.' }, spec: {} }] });
        apiregistration.readAPIService.mockResolvedValue({ metadata: { name: 'v1.' }, spec: {} });
        flowcontrol.listFlowSchema.mockResolvedValue({ items: [{ metadata: { name: 'exempt' }, spec: {} }] });
        flowcontrol.readFlowSchema.mockResolvedValue({ metadata: { name: 'exempt' }, spec: {} });

        await expect(apiserver.listApiServices()).resolves.toMatchObject([{ name: 'v1.', service: 'Local' }]);
        await expect(apiserver.getApiService('v1.')).resolves.toMatchObject({ name: 'v1.' });
        await expect(apiserver.listFlowSchemas()).resolves.toMatchObject([{ name: 'exempt' }]);
        await expect(apiserver.getFlowSchema('exempt')).resolves.toMatchObject({ matchingPrecedence: 1000 });
    });

    it('answers null for a missing object', async () => {
        const gone = new ApiException(404, 'not found', {}, {});
        apiregistration.readAPIService.mockRejectedValue(gone);
        flowcontrol.readFlowSchema.mockRejectedValue(gone);
        await expect(apiserver.getApiService('gone')).resolves.toBeNull();
        await expect(apiserver.getFlowSchema('gone')).resolves.toBeNull();
    });
});
