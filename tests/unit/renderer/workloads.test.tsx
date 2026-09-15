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

const deployment = {
    name: 'web',
    namespace: 'team-a',
    status: 'Progressing',
    ready: '2/3',
    replicas: 3,
    updated: 3,
    available: 2,
    strategy: 'Recreate',
    image: 'nginx:1.27',
    age: '3d',
};
const statefulSet = {
    name: 'db',
    namespace: 'team-a',
    ready: '2/2',
    replicas: 2,
    service: 'db-headless',
    image: 'postgres:16',
    age: '1h',
};
const daemonSet = {
    name: 'agent',
    namespace: 'kube-system',
    desired: 3,
    current: 3,
    ready: 2,
    upToDate: 3,
    nodeSelector: 'kubernetes.io/os=linux',
    age: '2h',
};
const meta = { labels: [['app', 'web']], annotations: [] };

const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'team-a', pods: 3, tone: 'accent' }],
    'namespace.active': { name: 'team-a', pods: 3, tone: 'accent' },
    'cluster.active': null,
    'events.forObject': [],
    'deployments.rollouts': [
        { rev: '2', state: 'Current', image: 'nginx:1.27', by: 'upgrade', when: '1h ago', duration: '1h' },
        { rev: '1', state: 'Superseded', image: 'nginx:1.26', by: '—', when: '3d ago', duration: '3d' },
    ],
    'deployments.replicaSets': [
        { name: 'web-2', desired: 3, current: 3, ready: 3, age: '1h' },
        { name: 'web-1', desired: 0, current: 0, ready: 0, age: '3d' },
    ],
    'metrics.deploymentSeries': { cpu: [100, 250], mem: [10, 20] },
};

function withResources(items: Record<string, unknown[]>, details: Record<string, unknown>) {
    invoke.mockImplementation(async (channel: string, input: { kind?: string }) => {
        if (channel === 'resources.list') return { kind: input.kind, items: items[input.kind!] ?? [] };
        if (channel === 'resources.get') return { kind: input.kind, item: details[input.kind!] ?? null };
        return data[channel];
    });
}

describe('workload lists', () => {
    beforeEach(() => {
        invoke.mockReset();
        withResources(
            {
                Deployment: [deployment, { ...deployment, name: 'api', status: 'Healthy', ready: '1/1' }],
                StatefulSet: [statefulSet],
                DaemonSet: [daemonSet],
            },
            {
                Deployment: { ...deployment, ...meta },
                StatefulSet: { ...statefulSet, ...meta },
                DaemonSet: { ...daemonSet, ...meta },
            },
        );
    });

    it('lists deployments with ready ratio, status tone and a link to the detail', async () => {
        renderRoutes(routeTree, '/workloads/deployments');
        const table = await screen.findByTestId('deployments-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', { kind: 'Deployment', namespace: undefined });
        const web = table.querySelector('[data-deployment="web"]') as HTMLElement;
        expect(within(web).getByRole('link', { name: 'web' })).toHaveAttribute(
            'href',
            '/workloads/deployments/team-a/web',
        );
        expect(within(web).getByText('2/3')).toHaveClass('text-warn');
        expect(within(web).getByText('Progressing')).toHaveAttribute('data-tone', 'warn');
        expect(web).toHaveTextContent('Recreate');
        expect(web).toHaveTextContent('nginx:1.27');
        const api = table.querySelector('[data-deployment="api"]') as HTMLElement;
        expect(within(api).getByText('1/1')).toHaveClass('text-ok');
        expect(within(api).getByText('Healthy')).toHaveAttribute('data-tone', 'ok');
        expect(stream).toHaveBeenCalledWith(
            'resources.watch',
            { kind: 'Deployment', namespace: undefined },
            expect.any(Function),
        );
    });

    it('lists statefulsets and daemonsets with their columns', async () => {
        renderRoutes(routeTree, '/workloads/statefulsets');
        const sets = await screen.findByTestId('statefulsets-table');
        const db = sets.querySelector('[data-statefulset="db"]') as HTMLElement;
        expect(within(db).getByRole('link', { name: 'db' })).toHaveAttribute(
            'href',
            '/workloads/statefulsets/team-a/db',
        );
        expect(db).toHaveTextContent('db-headless');
        expect(db).toHaveTextContent('postgres:16');

        await userEvent.click(screen.getByRole('link', { name: 'DaemonSets' }));
        const daemons = await screen.findByTestId('daemonsets-table');
        const agent = daemons.querySelector('[data-daemonset="agent"]') as HTMLElement;
        expect(within(agent).getByRole('link', { name: 'agent' })).toHaveAttribute(
            'href',
            '/workloads/daemonsets/kube-system/agent',
        );
        expect(
            within(daemons)
                .getAllByRole('columnheader')
                .map((h) => h.textContent),
        ).toEqual([
            // The blank leading header belongs to the selection checkbox column.
            '',
            'Name',
            'Desired',
            'Current',
            'Ready',
            'Up-to-date',
            'Node selector',
            'Age',
        ]);
        expect(agent).toHaveTextContent('kubernetes.io/os=linux');
    });
});

describe('workload details', () => {
    beforeEach(() => {
        invoke.mockReset();
        withResources(
            {},
            {
                Deployment: { ...deployment, ...meta },
                StatefulSet: { ...statefulSet, ...meta },
                DaemonSet: { ...daemonSet, ...meta },
            },
        );
    });

    it('renders the deployment header, metric cards, rollout history and replicasets', async () => {
        renderRoutes(routeTree, '/workloads/deployments/team-a/web');
        const page = await screen.findByTestId('deployment-page');
        await waitFor(() => expect(page).toHaveTextContent('replicas: 2/3'));
        expect(page).toHaveTextContent('strategy: Recreate');
        expect(within(page).getByText('Progressing', { selector: '[data-tone]' })).toHaveAttribute('data-tone', 'warn');
        await waitFor(() => expect(page).toHaveTextContent('250m'));
        expect(page).toHaveTextContent('Replicas3');
        expect(page).toHaveTextContent('Available2');
        expect(page).toHaveTextContent('Updated3');
        expect(within(page).getByRole('button', { name: 'Restart' })).toHaveAttribute('aria-disabled', 'true');

        const rail = within(page).getByRole('tablist');
        expect(
            within(rail)
                .getAllByRole('tab')
                .map((t) => t.textContent),
        ).toEqual(['Overview', 'Events', 'History2', 'ReplicaSets2', 'ManifestYAML', 'Labels1']);
        await userEvent.click(within(rail).getByRole('tab', { name: /History/ }));
        const history = within(page).getByTestId('rollout-history');
        expect(page).toHaveTextContent('2 revisions');
        const current = history.querySelector('[data-revision="2"]') as HTMLElement;
        expect(within(current).getByText('Current')).toHaveAttribute('data-tone', 'ok');
        expect(within(current).queryByRole('button', { name: 'Roll back' })).not.toBeInTheDocument();
        const superseded = history.querySelector('[data-revision="1"]') as HTMLElement;
        expect(within(superseded).getByText('Superseded')).toHaveAttribute('data-tone', 'neutral');
        expect(within(superseded).getByRole('button', { name: 'Roll back' })).toHaveAttribute('aria-disabled', 'true');
        expect(invoke).toHaveBeenCalledWith('deployments.rollouts', { name: 'web', namespace: 'team-a' });

        await userEvent.click(within(rail).getByRole('tab', { name: /ReplicaSets/ }));
        const sets = within(page).getByTestId('replica-sets');
        expect(within(sets).getAllByRole('row')).toHaveLength(3);
        expect(within(sets).getByText('web-2').closest('tr')?.querySelector('.text-ok')).toHaveTextContent('3');
        expect(within(sets).getByText('web-1').closest('tr')?.querySelector('.text-text-muted')).toHaveTextContent('0');
        expect(invoke).toHaveBeenCalledWith('metrics.deploymentSeries', { namespace: 'team-a', name: 'web' });
    });

    it('renders the statefulset and daemonset overviews and not-found states', async () => {
        renderRoutes(routeTree, '/workloads/statefulsets/team-a/db');
        const page = await screen.findByTestId('statefulset-page');
        await waitFor(() => expect(page).toHaveTextContent('service: db-headless'));
        expect(page).toHaveTextContent('postgres:16');
        expect(within(page).getByRole('tab', { name: /Labels/ })).toHaveTextContent('1');

        const { router } = renderRoutes(routeTree, '/workloads/daemonsets/kube-system/agent');
        const daemon = await screen.findByTestId('daemonset-page');
        await waitFor(() => expect(daemon).toHaveTextContent('desired: 3'));
        expect(daemon).toHaveTextContent('Node selector');
        expect(daemon).toHaveTextContent('kubernetes.io/os=linux');

        invoke.mockImplementation(async (channel: string, input: { kind?: string }) =>
            channel === 'resources.get' ? { kind: input.kind, item: null } : data[channel],
        );
        await router.navigate({
            to: '/workloads/daemonsets/$namespace/$name',
            params: { namespace: 'kube-system', name: 'ghost' },
        });
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'DaemonSet “ghost” was not found in namespace “kube-system”.',
        );
    });
});
