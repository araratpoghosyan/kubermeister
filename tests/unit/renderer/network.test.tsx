import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

const service = {
    name: 'web',
    namespace: 'team-a',
    type: 'ClusterIP',
    status: 'Active',
    clusterIp: '10.43.0.10',
    externalIp: '—',
    ports: '80/TCP',
    age: '1h',
};
const ingress = {
    name: 'web',
    namespace: 'team-a',
    className: 'traefik',
    status: 'Pending',
    hosts: 'web.example.com',
    address: '—',
    ports: '80,443',
    age: '1h',
};
const endpoints = { name: 'web', namespace: 'team-a', endpoints: '10.0.0.1:8080', age: '1h' };
const policy = {
    name: 'deny-all',
    namespace: 'team-a',
    podSelector: '<all pods>',
    policyTypes: 'Ingress, Egress',
    age: '1h',
};
const meta = { labels: [['app', 'web']], annotations: [] };
const rows: Record<string, unknown[]> = {
    Service: [service, { ...service, name: 'lb', type: 'LoadBalancer', status: 'Pending' }],
    Ingress: [ingress],
    Endpoints: [endpoints],
    NetworkPolicy: [policy],
};
const details: Record<string, unknown> = {
    Service: { ...service, selector: [['app', 'web']], ...meta },
    Ingress: { ...ingress, tls: [{ secretName: 'web-tls', hosts: 'web.example.com' }], issuer: 'letsencrypt', ...meta },
    Endpoints: { ...endpoints, ...meta },
    NetworkPolicy: { ...policy, ...meta },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'team-a', pods: 1, tone: 'accent' }],
    'namespace.active': { name: 'team-a', pods: 1, tone: 'accent' },
    'cluster.active': null,
    'events.forObject': [],
    'services.ports': [{ name: 'http', port: '80', protocol: 'TCP', target: '8080', appProtocol: '—' }],
    'services.endpoints': [
        { pod: 'web-1', node: 'n1', address: '10.0.0.1', ready: 'Ready' },
        { pod: 'web-2', node: 'n1', address: '10.0.0.2', ready: 'NotReady' },
    ],
    'ingresses.rules': [{ host: 'web.example.com', path: '/', backend: 'web', port: '80' }],
};

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (channel: string, input: { kind?: string }) => {
        if (channel === 'resources.list') return { kind: input.kind, items: rows[input.kind!] ?? [] };
        if (channel === 'resources.get') return { kind: input.kind, item: details[input.kind!] ?? null };
        return data[channel];
    });
});

describe('network lists', () => {
    it('lists services with a toned type badge and links to the detail', async () => {
        renderRoutes(routeTree, '/network/services');
        const table = await screen.findByTestId('services-table');
        const web = table.querySelector('[data-service="web"]') as HTMLElement;
        expect(within(web).getByRole('link', { name: 'web' })).toHaveAttribute('href', '/network/services/team-a/web');
        expect(within(web).getByText('ClusterIP')).not.toHaveClass('text-primary');
        expect(web).toHaveTextContent('10.43.0.10');
        const lb = table.querySelector('[data-service="lb"]') as HTMLElement;
        expect(within(lb).getByText('LoadBalancer')).toHaveClass('text-primary');
    });

    it('lists ingresses, endpoints and policies with their columns', async () => {
        renderRoutes(routeTree, '/network/ingresses');
        const ingresses = await screen.findByTestId('ingresses-table');
        expect(
            within(ingresses)
                .getAllByRole('columnheader')
                .map((h) => h.textContent),
        ).toEqual(['Name', 'Class', 'Hosts', 'Address', 'Ports', 'Age']);
        expect(ingresses).toHaveTextContent('web.example.com');

        await userEvent.click(screen.getByRole('link', { name: 'Endpoints', exact: true }));
        expect(await screen.findByTestId('endpoints-table')).toHaveTextContent('10.0.0.1:8080');

        await userEvent.click(screen.getByRole('link', { name: 'NetworkPolicies' }));
        const policies = await screen.findByTestId('networkpolicies-table');
        expect(policies).toHaveTextContent('<all pods>');
        expect(policies).toHaveTextContent('Ingress, Egress');
    });
});

describe('network details', () => {
    it('shows the service ports, endpoints and selector', async () => {
        renderRoutes(routeTree, '/network/services/team-a/web');
        const page = await screen.findByTestId('service-page');
        await waitFor(() => expect(page).toHaveTextContent('type: ClusterIP'));
        expect(within(page).getAllByText('Active', { selector: '[data-tone]' })[0]).toHaveAttribute('data-tone', 'ok');
        await waitFor(() => expect(page).toHaveTextContent('1 ready · 1 not ready'));
        const rail = within(page).getByRole('tablist');
        expect(
            within(rail)
                .getAllByRole('tab')
                .map((t) => t.textContent),
        ).toEqual(['Overview', 'Events', 'Ports1', 'Endpoints2', 'Selector1', 'ManifestYAML', 'Labels1']);
        await userEvent.click(within(rail).getByRole('tab', { name: /Ports/ }));
        expect(within(page).getByTestId('service-ports')).toHaveTextContent('8080');
        await userEvent.click(within(rail).getByRole('tab', { name: /^Endpoints/ }));
        const table = within(page).getByTestId('service-endpoints');
        // The column header is also called Ready, so match the badges by their tone attribute.
        expect(within(table).getByText('Ready', { selector: '[data-tone]' })).toHaveAttribute('data-tone', 'ok');
        expect(within(table).getByText('NotReady', { selector: '[data-tone]' })).toHaveAttribute('data-tone', 'warn');
        await userEvent.click(within(rail).getByRole('tab', { name: /Selector/ }));
        expect(page).toHaveTextContent('app');
    });

    it('shows the ingress rules and TLS, with a pending status until an address exists', async () => {
        renderRoutes(routeTree, '/network/ingresses/team-a/web');
        const page = await screen.findByTestId('ingress-page');
        await waitFor(() => expect(page).toHaveTextContent('class: traefik'));
        expect(within(page).getAllByText('Pending', { selector: '[data-tone]' })[0]).toHaveAttribute(
            'data-tone',
            'warn',
        );
        expect(page).toHaveTextContent('tls: enabled');
        const rail = within(page).getByRole('tablist');
        await userEvent.click(within(rail).getByRole('tab', { name: /Rules/ }));
        expect(within(page).getByTestId('ingress-rules')).toHaveTextContent('web.example.com');
        await userEvent.click(within(rail).getByRole('tab', { name: 'TLS' }));
        const tls = within(page).getByTestId('ingress-tls');
        expect(tls).toHaveTextContent('web-tls');
        expect(tls).toHaveTextContent('letsencrypt');
    });

    it('shows the endpoints and policy overviews and a not-found state', async () => {
        renderRoutes(routeTree, '/network/endpoints/team-a/web');
        const page = await screen.findByTestId('endpoints-page');
        await waitFor(() => expect(page).toHaveTextContent('endpoints: 10.0.0.1:8080'));

        const { router } = renderRoutes(routeTree, '/network/networkpolicies/team-a/deny-all');
        const policyPage = await screen.findByTestId('networkpolicy-page');
        await waitFor(() => expect(policyPage).toHaveTextContent('selector: <all pods>'));
        expect(policyPage).toHaveTextContent('Policy types');

        invoke.mockImplementation(async (channel: string, input: { kind?: string }) =>
            channel === 'resources.get' ? { kind: input.kind, item: null } : data[channel],
        );
        await router.navigate({
            to: '/network/networkpolicies/$namespace/$name',
            params: { namespace: 'team-a', name: 'ghost' },
        });
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'NetworkPolicy “ghost” was not found in namespace “team-a”.',
        );
    });
});
