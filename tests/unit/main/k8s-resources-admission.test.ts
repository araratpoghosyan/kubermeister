import {
    ApiException,
    type V1MutatingWebhookConfiguration,
    type V1ValidatingAdmissionPolicy,
} from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const admissionApi = {
    listMutatingWebhookConfiguration: vi.fn(),
    readMutatingWebhookConfiguration: vi.fn(),
    listValidatingWebhookConfiguration: vi.fn(),
    readValidatingWebhookConfiguration: vi.fn(),
    listValidatingAdmissionPolicy: vi.fn(),
    readValidatingAdmissionPolicy: vi.fn(),
};
const client = {
    apis: () => ({ admission: admissionApi }),
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

const admission = await import('../../../src/main/k8s/resources/admission.js');

const NOW = Date.parse('2026-09-16T12:00:00Z');
const HOUR = 3600 * 1000;

describe('webhook configuration transforms', () => {
    const configuration: V1MutatingWebhookConfiguration = {
        metadata: { name: 'sidecar-injector', creationTimestamp: new Date(NOW - HOUR), labels: { app: 'mesh' } },
        webhooks: [
            { name: 'inject.mesh.io', failurePolicy: 'Fail', sideEffects: 'None', admissionReviewVersions: ['v1'] },
            { name: 'label.mesh.io', failurePolicy: 'Ignore', sideEffects: 'None', admissionReviewVersions: ['v1'] },
        ],
    };

    it('counts and names the webhooks and lists every failure policy in use', () => {
        expect(admission.toWebhookConfig(configuration, NOW)).toEqual({
            name: 'sidecar-injector',
            status: 'Blocking',
            webhooks: 2,
            webhookNames: 'inject.mesh.io, label.mesh.io',
            failurePolicy: 'Fail, Ignore',
            age: '1h',
        });
        expect(admission.toWebhookConfigDetail(configuration, NOW)).toMatchObject({ labels: [['app', 'mesh']] });
    });

    it('is Blocking whenever one webhook fails closed, and a missing policy counts as Fail', () => {
        expect(admission.webhookStatus(['Ignore', 'Fail'])).toBe('Blocking');
        expect(admission.webhookStatus(['Ignore'])).toBe('Permissive');
        // The API's own default is Fail, so a webhook naming no policy blocks writes too.
        const unset = { metadata: { name: 'x' }, webhooks: [{ name: 'a' }] } as V1MutatingWebhookConfiguration;
        expect(admission.toWebhookConfig(unset, NOW)).toMatchObject({ status: 'Blocking', failurePolicy: 'Fail' });
    });

    it('reads a configuration with no webhooks as harmless', () => {
        expect(admission.toWebhookConfig({ metadata: { name: 'empty' } }, NOW)).toEqual({
            name: 'empty',
            status: 'Permissive',
            webhooks: 0,
            webhookNames: '—',
            failurePolicy: '—',
            age: '—',
        });
    });
});

describe('admission policy transforms', () => {
    const policy: V1ValidatingAdmissionPolicy = {
        metadata: { name: 'no-latest', creationTimestamp: new Date(NOW - 2 * HOUR) },
        spec: {
            failurePolicy: 'Fail',
            validations: [{ expression: 'true' }, { expression: 'false' }],
            matchConstraints: {
                resourceRules: [
                    { apiGroups: ['apps'], apiVersions: ['v1'], operations: ['CREATE'], resources: ['deployments'] },
                    { apiGroups: [''], apiVersions: ['v1'], operations: ['CREATE'], resources: ['pods'] },
                ],
            },
        },
    };

    it('counts the expressions it checks and names the resources it matches', () => {
        expect(admission.toAdmissionPolicy(policy, NOW)).toEqual({
            name: 'no-latest',
            failurePolicy: 'Fail',
            validations: 2,
            // The core group has no name, so its resources are named on their own.
            matches: 'apps/deployments, pods',
            age: '2h',
        });
        expect(admission.toAdmissionPolicyDetail(policy, NOW)).toMatchObject({ labels: [], annotations: [] });
    });

    it('falls back to the API defaults for a policy that states neither', () => {
        expect(admission.toAdmissionPolicy({ metadata: { name: 'bare' } }, NOW)).toEqual({
            name: 'bare',
            failurePolicy: 'Fail',
            validations: 0,
            matches: '—',
            age: '—',
        });
        // A rule matching every group reads as the bare resource rather than as "*/pods".
        const wildcard = {
            metadata: { name: 'any' },
            spec: { matchConstraints: { resourceRules: [{ apiGroups: ['*'], resources: ['pods'] }] } },
        } as V1ValidatingAdmissionPolicy;
        expect(admission.toAdmissionPolicy(wildcard, NOW).matches).toBe('pods');
    });
});

describe('admission readers', () => {
    beforeEach(() => {
        for (const fn of Object.values(admissionApi)) fn.mockReset();
    });

    it('lists and reads all three kinds cluster-wide', async () => {
        admissionApi.listMutatingWebhookConfiguration.mockResolvedValue({ items: [{ metadata: { name: 'm' } }] });
        admissionApi.readMutatingWebhookConfiguration.mockResolvedValue({ metadata: { name: 'm' } });
        admissionApi.listValidatingWebhookConfiguration.mockResolvedValue({ items: [{ metadata: { name: 'v' } }] });
        admissionApi.readValidatingWebhookConfiguration.mockResolvedValue({ metadata: { name: 'v' } });
        admissionApi.listValidatingAdmissionPolicy.mockResolvedValue({ items: [{ metadata: { name: 'p' } }] });
        admissionApi.readValidatingAdmissionPolicy.mockResolvedValue({ metadata: { name: 'p' } });

        await expect(admission.listMutatingWebhooks()).resolves.toMatchObject([{ name: 'm' }]);
        await expect(admission.getMutatingWebhook('m')).resolves.toMatchObject({ name: 'm' });
        await expect(admission.listValidatingWebhooks()).resolves.toMatchObject([{ name: 'v' }]);
        await expect(admission.getValidatingWebhook('v')).resolves.toMatchObject({ name: 'v' });
        await expect(admission.listAdmissionPolicies()).resolves.toMatchObject([{ name: 'p' }]);
        await expect(admission.getAdmissionPolicy('p')).resolves.toMatchObject({ name: 'p' });
        expect(admissionApi.readValidatingAdmissionPolicy).toHaveBeenCalledWith({ name: 'p' });
    });

    it('answers null for a missing object and classifies a refusal', async () => {
        const gone = new ApiException(404, 'not found', {}, {});
        admissionApi.readMutatingWebhookConfiguration.mockRejectedValue(gone);
        admissionApi.readValidatingWebhookConfiguration.mockRejectedValue(gone);
        admissionApi.readValidatingAdmissionPolicy.mockRejectedValue(gone);
        await expect(admission.getMutatingWebhook('gone')).resolves.toBeNull();
        await expect(admission.getValidatingWebhook('gone')).resolves.toBeNull();
        await expect(admission.getAdmissionPolicy('gone')).resolves.toBeNull();

        admissionApi.listValidatingAdmissionPolicy.mockRejectedValue(
            new ApiException(404, 'the server could not find the requested resource', {}, {}),
        );
        await expect(admission.listAdmissionPolicies()).rejects.toMatchObject({
            kind: 'notFound',
            op: 'resources.list',
        });
    });
});
