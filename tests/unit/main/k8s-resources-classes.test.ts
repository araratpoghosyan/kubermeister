import { ApiException, type V1IngressClass, type V1RuntimeClass } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = { listRuntimeClass: vi.fn(), readRuntimeClass: vi.fn() };
const net = { listIngressClass: vi.fn(), readIngressClass: vi.fn() };
const client = {
    apis: () => ({ runtime, net }),
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

const classes = await import('../../../src/main/k8s/resources/classes.js');

const NOW = Date.parse('2026-09-16T12:00:00Z');
const HOUR = 3600 * 1000;

describe('runtime class transforms', () => {
    const runtimeClass: V1RuntimeClass = {
        metadata: { name: 'gvisor', creationTimestamp: new Date(NOW - 3 * HOUR), labels: { tier: 'sandbox' } },
        handler: 'runsc',
        scheduling: { nodeSelector: { sandbox: 'true' } },
        overhead: { podFixed: { cpu: '250m', memory: '120Mi' } },
    };

    it('reads the handler, where its pods may land and what they cost', () => {
        expect(classes.toRuntimeClass(runtimeClass, NOW)).toEqual({
            name: 'gvisor',
            handler: 'runsc',
            nodeSelector: 'sandbox=true',
            overhead: 'cpu=250m,memory=120Mi',
            age: '3h',
        });
        expect(classes.toRuntimeClassDetail(runtimeClass, NOW)).toMatchObject({
            labels: [['tier', 'sandbox']],
            annotations: [],
        });
    });

    it('dashes a class that restricts nothing and adds no overhead', () => {
        expect(classes.toRuntimeClass({ metadata: { name: 'runc' }, handler: 'runc' }, NOW)).toEqual({
            name: 'runc',
            handler: 'runc',
            nodeSelector: '—',
            overhead: '—',
            age: '—',
        });
    });
});

describe('ingress class transforms', () => {
    const ingressClass: V1IngressClass = {
        metadata: {
            name: 'nginx',
            creationTimestamp: new Date(NOW - HOUR),
            annotations: { 'ingressclass.kubernetes.io/is-default-class': 'true' },
        },
        spec: { controller: 'k8s.io/ingress-nginx', parameters: { kind: 'IngressParameters', name: 'nginx-params' } },
    };

    it('reads the controller, its parameters and whether it is the default', () => {
        expect(classes.toIngressClass(ingressClass, NOW)).toEqual({
            name: 'nginx',
            controller: 'k8s.io/ingress-nginx',
            parameters: 'IngressParameters/nginx-params',
            isDefault: true,
            age: '1h',
        });
        expect(classes.toIngressClassDetail(ingressClass, NOW)).toMatchObject({ labels: [] });
    });

    it('is not default without the annotation, and dashes absent parameters', () => {
        expect(classes.toIngressClass({ metadata: { name: 'traefik' }, spec: {} }, NOW)).toEqual({
            name: 'traefik',
            controller: '—',
            parameters: '—',
            isDefault: false,
            age: '—',
        });
        // Any other value is not a default class either; only "true" is.
        expect(
            classes.toIngressClass(
                {
                    metadata: { name: 'x', annotations: { 'ingressclass.kubernetes.io/is-default-class': 'false' } },
                },
                NOW,
            ).isDefault,
        ).toBe(false);
    });
});

describe('class readers', () => {
    beforeEach(() => {
        for (const api of [runtime, net]) for (const fn of Object.values(api)) fn.mockReset();
    });

    it('lists and gets both kinds cluster-wide', async () => {
        runtime.listRuntimeClass.mockResolvedValue({ items: [{ metadata: { name: 'runc' }, handler: 'runc' }] });
        runtime.readRuntimeClass.mockResolvedValue({ metadata: { name: 'runc' }, handler: 'runc' });
        net.listIngressClass.mockResolvedValue({ items: [{ metadata: { name: 'nginx' }, spec: {} }] });
        net.readIngressClass.mockResolvedValue({ metadata: { name: 'nginx' }, spec: {} });

        await expect(classes.listRuntimeClasses()).resolves.toMatchObject([{ name: 'runc', handler: 'runc' }]);
        await expect(classes.getRuntimeClass('runc')).resolves.toMatchObject({ name: 'runc' });
        await expect(classes.listIngressClasses()).resolves.toMatchObject([{ name: 'nginx' }]);
        await expect(classes.getIngressClass('nginx')).resolves.toMatchObject({ name: 'nginx' });
        expect(net.readIngressClass).toHaveBeenCalledWith({ name: 'nginx' });
    });

    it('answers null for a missing object and classifies a refusal', async () => {
        const gone = new ApiException(404, 'not found', {}, {});
        runtime.readRuntimeClass.mockRejectedValue(gone);
        net.readIngressClass.mockRejectedValue(gone);
        await expect(classes.getRuntimeClass('gone')).resolves.toBeNull();
        await expect(classes.getIngressClass('gone')).resolves.toBeNull();

        net.listIngressClass.mockRejectedValue(new ApiException(403, 'x', { message: 'denied' }, {}));
        await expect(classes.listIngressClasses()).rejects.toMatchObject({
            kind: 'forbidden',
            op: 'resources.list',
        });
    });
});
