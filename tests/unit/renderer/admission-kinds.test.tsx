import { screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderRoutes } from './helpers';

const invoke = vi.fn();
const subscribe = vi.fn(() => () => {});
const stream = vi.fn(() => ({ stop: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke,
    subscribe,
    stream,
}));

const { routeTree } = await import('@/routeTree.gen');

const blocking = {
    name: 'sidecar-injector',
    status: 'Blocking',
    webhooks: 2,
    webhookNames: 'inject.mesh.io, label.mesh.io',
    failurePolicy: 'Fail, Ignore',
    age: '1h',
};
const permissive = { ...blocking, name: 'optional-hook', status: 'Permissive', webhooks: 1, failurePolicy: 'Ignore' };
const policy = { name: 'no-latest', failurePolicy: 'Fail', validations: 2, matches: 'apps/deployments', age: '2h' };
const apiService = {
    name: 'v1beta1.metrics.k8s.io',
    status: 'Unavailable',
    group: 'metrics.k8s.io',
    version: 'v1beta1',
    service: 'kube-system/metrics-server',
    reason: 'no endpoints available',
    age: '1h',
};
const flowSchema = {
    name: 'workload-high',
    priorityLevel: 'workload-high',
    matchingPrecedence: 800,
    distinguisher: 'ByUser',
    age: '3h',
};

const meta = { labels: [['app', 'mesh']], annotations: [] };
const rows: Record<string, unknown[]> = {
    MutatingWebhookConfiguration: [blocking],
    ValidatingWebhookConfiguration: [blocking, permissive],
    ValidatingAdmissionPolicy: [policy],
    APIService: [apiService],
    FlowSchema: [flowSchema],
};
const details: Record<string, unknown> = {
    MutatingWebhookConfiguration: { ...blocking, ...meta },
    ValidatingWebhookConfiguration: { ...blocking, ...meta },
    ValidatingAdmissionPolicy: { ...policy, ...meta },
    APIService: { ...apiService, ...meta },
    FlowSchema: { ...flowSchema, ...meta },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'kube-system', tone: 'accent' }],
    'namespace.active': { name: 'kube-system' },
    'cluster.active': null,
    'events.forObject': [],
};

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (channel: string, input: { kind?: string }) => {
        if (channel === 'resources.list') return { kind: input.kind, items: rows[input.kind!] ?? [] };
        if (channel === 'resources.get') return { kind: input.kind, item: details[input.kind!] ?? null };
        return data[channel];
    });
});

describe('admission screens', () => {
    it('tones a configuration that fails closed, since it stands between a write and the cluster', async () => {
        renderRoutes(routeTree, '/addons/validatingwebhooks');
        const table = await screen.findByTestId('validatingwebhooks-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', {
            kind: 'ValidatingWebhookConfiguration',
            namespace: undefined,
        });
        const strict = table.querySelector('[data-validatingwebhook="sidecar-injector"]') as HTMLElement;
        expect(within(strict).getByText('Blocking')).toHaveAttribute('data-tone', 'warn');
        expect(strict).toHaveTextContent('Fail, Ignore');
        const lax = table.querySelector('[data-validatingwebhook="optional-hook"]') as HTMLElement;
        expect(within(lax).getByText('Permissive')).toHaveAttribute('data-tone', 'neutral');
    });

    it('lists mutating configurations with the webhooks they hold', async () => {
        renderRoutes(routeTree, '/addons/mutatingwebhooks');
        const table = await screen.findByTestId('mutatingwebhooks-table');
        const row = table.querySelector('[data-mutatingwebhook="sidecar-injector"]') as HTMLElement;
        expect(row).toHaveTextContent('inject.mesh.io');
        expect(within(row).getByRole('link', { name: 'sidecar-injector' })).toHaveAttribute(
            'href',
            '/addons/mutatingwebhooks/sidecar-injector',
        );
    });

    it('lists admission policies with what they check and what they match', async () => {
        renderRoutes(routeTree, '/addons/admissionpolicies');
        const table = await screen.findByTestId('admissionpolicies-table');
        const row = table.querySelector('[data-admissionpolicy="no-latest"]') as HTMLElement;
        expect(row).toHaveTextContent('apps/deployments');
        expect(row).toHaveTextContent('2');
    });

    it('renders the webhook and policy details', async () => {
        const { unmount } = renderRoutes(routeTree, '/addons/mutatingwebhooks/sidecar-injector');
        const page = await screen.findByTestId('mutatingwebhook-page');
        await waitFor(() => expect(page).toHaveTextContent('webhooks: 2'));
        expect(within(page).getAllByText('Blocking', { selector: '[data-tone]' })[0]).toHaveAttribute(
            'data-tone',
            'warn',
        );
        unmount();

        renderRoutes(routeTree, '/addons/admissionpolicies/no-latest');
        const policyPage = await screen.findByTestId('admissionpolicy-page');
        await waitFor(() => expect(policyPage).toHaveTextContent('validations: 2'));
        expect(within(policyPage).getByText('Matches')).toBeInTheDocument();
    });
});

describe('api server screens', () => {
    it('shows an aggregated API as unavailable with the reason it gives', async () => {
        renderRoutes(routeTree, '/addons/apiservices');
        const table = await screen.findByTestId('apiservices-table');
        const row = table.querySelector('[data-apiservice="v1beta1.metrics.k8s.io"]') as HTMLElement;
        expect(within(row).getByText('Unavailable')).toHaveAttribute('data-tone', 'danger');
        expect(row).toHaveTextContent('kube-system/metrics-server');
        expect(row).toHaveTextContent('no endpoints available');
    });

    it('lists flow schemas by the level they feed and their precedence', async () => {
        renderRoutes(routeTree, '/addons/flowschemas');
        const table = await screen.findByTestId('flowschemas-table');
        const row = table.querySelector('[data-flowschema="workload-high"]') as HTMLElement;
        expect(row).toHaveTextContent('800');
        expect(row).toHaveTextContent('ByUser');
    });

    it('renders both details, which carry no namespace at all', async () => {
        const { unmount } = renderRoutes(routeTree, '/addons/apiservices/v1beta1.metrics.k8s.io');
        const page = await screen.findByTestId('apiservice-page');
        await waitFor(() => expect(page).toHaveTextContent('service: kube-system/metrics-server'));
        expect(invoke).toHaveBeenCalledWith('resources.get', {
            kind: 'APIService',
            name: 'v1beta1.metrics.k8s.io',
            namespace: undefined,
        });
        unmount();

        renderRoutes(routeTree, '/addons/flowschemas/workload-high');
        const flow = await screen.findByTestId('flowschema-page');
        await waitFor(() => expect(flow).toHaveTextContent('precedence: 800'));
    });
});
