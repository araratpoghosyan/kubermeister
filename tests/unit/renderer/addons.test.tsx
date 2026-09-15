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

const crd = {
    name: 'helmcharts.helm.cattle.io',
    group: 'helm.cattle.io',
    version: 'v1',
    scope: 'Namespaced',
    kind: 'HelmChart',
    age: '3h',
};
const clusterCrd = { ...crd, name: 'addons.k3s.cattle.io', scope: 'Cluster', kind: 'Addon' };
const release = {
    name: 'traefik',
    namespace: 'kube-system',
    chart: 'traefik-28.0.0',
    revision: 2,
    status: 'Deployed',
    updated: '1h ago',
    values: 'service:\n  type: LoadBalancer\n',
};
const chart = {
    name: 'traefik',
    repository: '—',
    latestVersion: '28.0.0',
    appVersion: '3.0.0',
    description: 'Upgrade complete',
};
const revisions = [
    { rev: '2', status: 'Deployed', chartVersion: '28.0.0', updated: '1h ago', description: 'Upgrade complete' },
    { rev: '1', status: 'Superseded', chartVersion: '27.0.0', updated: '2h ago', description: 'Install complete' },
];
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'kube-system', pods: 3, tone: 'accent' }],
    'namespace.active': { name: 'kube-system', pods: 3, tone: 'accent' },
    'cluster.active': null,
    'events.forObject': [],
    'releases.list': [release],
    'releases.get': release,
    'releases.revisions': revisions,
    'helmCharts.list': [chart],
};

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (channel: string, input: { kind?: string }) => {
        if (channel === 'resources.list') return { kind: input.kind, items: [crd, clusterCrd] };
        if (channel === 'resources.get') return { kind: input.kind, item: { ...crd, labels: [], annotations: [] } };
        return data[channel];
    });
});

describe('add-on lists', () => {
    it('lists the charts derived from the installed releases', async () => {
        renderRoutes(routeTree, '/addons/charts');
        const table = await screen.findByTestId('charts-table');
        const row = table.querySelector('[data-chart="traefik"]') as HTMLElement;
        expect(row).toHaveTextContent('28.0.0');
        expect(row).toHaveTextContent('3.0.0');
        expect(row).toHaveTextContent('Upgrade complete');
    });

    it('lists releases with a toned status and definitions marking the cluster-scoped ones', async () => {
        renderRoutes(routeTree, '/addons/releases');
        const releases = await screen.findByTestId('releases-table');
        const releaseRow = releases.querySelector('[data-release="traefik"]') as HTMLElement;
        expect(within(releaseRow).getByText('Deployed')).toHaveAttribute('data-tone', 'ok');
        expect(within(releaseRow).getByRole('link', { name: 'traefik' })).toHaveAttribute(
            'href',
            '/addons/releases/kube-system/traefik',
        );

        await userEvent.click(screen.getByRole('link', { name: 'CRDs' }));
        const crds = await screen.findByTestId('crds-table');
        expect(crds.querySelector('[data-crd="helmcharts.helm.cattle.io"]')).toHaveTextContent('HelmChart');
        expect(crds.querySelector('[data-crd="addons.k3s.cattle.io"]')).toHaveTextContent('Cluster');
    });
});

describe('add-on details', () => {
    it('shows a release with its revision history and user-supplied values', async () => {
        renderRoutes(routeTree, '/addons/releases/kube-system/traefik');
        const page = await screen.findByTestId('release-page');
        await waitFor(() => expect(page).toHaveTextContent('chart: traefik-28.0.0'));
        expect(page).toHaveTextContent('revision: 2');
        const history = within(page).getByTestId('release-revisions');
        expect(history).toHaveTextContent('#2');
        expect(history).toHaveTextContent('Install complete');

        await userEvent.click(within(page).getByRole('tab', { name: /Values/ }));
        expect(within(page).getByTestId('release-values')).toHaveTextContent('type: LoadBalancer');
    });

    it('says a release without user-supplied values runs on chart defaults', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'releases.get' ? { ...release, values: undefined } : data[channel],
        );
        renderRoutes(routeTree, '/addons/releases/kube-system/traefik');
        const page = await screen.findByTestId('release-page');
        await waitFor(() => expect(page).toHaveTextContent('revision: 2'));
        await userEvent.click(within(page).getByRole('tab', { name: /Values/ }));
        expect(within(page).getByTestId('release-values')).toHaveTextContent('uses chart defaults');
    });

    it('shows a definition detail and reports a missing one without naming a namespace', async () => {
        const { router } = renderRoutes(routeTree, '/addons/crds/helmcharts.helm.cattle.io');
        const page = await screen.findByTestId('crd-page');
        await waitFor(() => expect(page).toHaveTextContent('group: helm.cattle.io'));
        expect(page).toHaveTextContent('kind: HelmChart');

        invoke.mockImplementation(async (channel: string, input: { kind?: string }) =>
            channel === 'resources.get' ? { kind: input.kind, item: null } : data[channel],
        );
        await router.navigate({ to: '/addons/crds/$name', params: { name: 'ghost' } });
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'CustomResourceDefinition “ghost” was not found.',
        );
    });
});
