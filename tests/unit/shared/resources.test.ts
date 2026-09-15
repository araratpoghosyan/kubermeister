import { describe, expect, it } from 'vitest';
import { KIND_REGISTRY, KINDS, kindInfo, kindSchema } from '../../../src/shared/k8s/registry';
import {
    resourceGetInputSchema,
    resourceGetOutputSchema,
    resourceListInputSchema,
    resourceListOutputSchema,
} from '../../../src/shared/k8s/resources';

const podRow = {
    name: 'web-1',
    namespace: 'team-a',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    age: '3d',
    node: 'n1',
    cpu: 0,
    mem: 0,
    cpuLimit: 500,
    memLimit: 128,
};

describe('kind registry', () => {
    it('knows every kind with its API facts and list path', () => {
        expect(KINDS).toEqual(['Pod', 'Deployment', 'StatefulSet', 'DaemonSet']);
        expect(kindInfo('Deployment')).toMatchObject({
            apiVersion: 'apps/v1',
            scalable: true,
            listPath: '/workloads/deployments',
        });
        expect(kindInfo('DaemonSet').scalable).toBe(false);
        expect(kindInfo('Pod')).toEqual({
            kind: 'Pod',
            apiVersion: 'v1',
            clusterScoped: false,
            scalable: false,
            listPath: '/workloads/pods',
        });
        for (const info of Object.values(KIND_REGISTRY)) expect(info.listPath.startsWith('/')).toBe(true);
    });

    it('rejects unknown kinds at the schema boundary', () => {
        expect(kindSchema.safeParse('Pod').success).toBe(true);
        expect(kindSchema.safeParse('pod').success).toBe(false);
        expect(kindSchema.safeParse('Deployment').success).toBe(true);
        expect(kindSchema.safeParse('ReplicaSet').success).toBe(false);
    });
});

describe('generic resource channels', () => {
    it('validates list and get inputs', () => {
        expect(resourceListInputSchema.safeParse({ kind: 'Pod' }).success).toBe(true);
        expect(resourceListInputSchema.safeParse({ kind: 'Pod', namespace: 'x' }).success).toBe(true);
        expect(resourceListInputSchema.safeParse({ kind: 'Nope' }).success).toBe(false);
        expect(resourceGetInputSchema.safeParse({ kind: 'Pod', name: 'web-1' }).success).toBe(true);
        expect(resourceGetInputSchema.safeParse({ kind: 'Pod', name: '' }).success).toBe(false);
    });

    it('discriminates outputs on kind', () => {
        expect(resourceListOutputSchema.safeParse({ kind: 'Pod', items: [podRow] }).success).toBe(true);
        expect(
            resourceListOutputSchema.safeParse({ kind: 'Pod', items: [{ ...podRow, status: 'Sleeping' }] }).success,
        ).toBe(false);
        expect(resourceGetOutputSchema.safeParse({ kind: 'Pod', item: null }).success).toBe(true);
        expect(resourceGetOutputSchema.safeParse({ kind: 'Node', item: null }).success).toBe(false);
        const deployment = {
            name: 'web',
            namespace: 'a',
            status: 'Healthy',
            ready: '1/1',
            replicas: 1,
            updated: 1,
            available: 1,
            strategy: 'RollingUpdate',
            image: 'x',
            age: '1h',
        };
        expect(resourceListOutputSchema.safeParse({ kind: 'Deployment', items: [deployment] }).success).toBe(true);
        expect(
            resourceListOutputSchema.safeParse({ kind: 'Deployment', items: [{ ...deployment, status: 'Odd' }] })
                .success,
        ).toBe(false);
        expect(resourceGetOutputSchema.safeParse({ kind: 'Deployment', item: deployment }).success).toBe(false);
        expect(
            resourceGetOutputSchema.safeParse({
                kind: 'Deployment',
                item: { ...deployment, labels: [], annotations: [] },
            }).success,
        ).toBe(true);
        expect(
            resourceListOutputSchema.safeParse({
                kind: 'DaemonSet',
                items: [
                    {
                        name: 'a',
                        namespace: 'b',
                        desired: 1,
                        current: 1,
                        ready: 1,
                        upToDate: 1,
                        nodeSelector: '<none>',
                        age: '1h',
                    },
                ],
            }).success,
        ).toBe(true);
    });
});
