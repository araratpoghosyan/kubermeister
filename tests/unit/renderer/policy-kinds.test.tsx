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

const replicaSet = {
    name: 'web-7d9',
    namespace: 'team-a',
    owner: 'Deployment/web',
    desired: 3,
    current: 3,
    ready: 2,
    image: 'nginx:1.27',
    age: '1h',
};
const controller = { ...replicaSet, name: 'legacy', owner: '—', image: 'busybox:1.36' };
const budget = {
    name: 'web',
    namespace: 'team-a',
    status: 'Satisfied',
    policy: 'min available 2',
    currentHealthy: 3,
    desiredHealthy: 2,
    disruptionsAllowed: 1,
    selector: 'app=web',
    age: '2h',
};
const blocked = { ...budget, name: 'locked', status: 'Blocked', disruptionsAllowed: 0 };
const priorityClass = {
    name: 'system-critical',
    value: 2000000,
    globalDefault: true,
    preemption: 'Never',
    description: 'Never evicted.',
    age: '4d',
};
const plain = { ...priorityClass, name: 'low', value: -10, globalDefault: false };
const lease = {
    name: 'kube-scheduler',
    namespace: 'kube-system',
    holder: 'node-1_8f2',
    duration: '15s',
    renewed: '1m ago',
    age: '3d',
};

const meta = { labels: [['app', 'web']], annotations: [] };
const rows: Record<string, unknown[]> = {
    ReplicaSet: [replicaSet],
    ReplicationController: [controller],
    PodDisruptionBudget: [budget, blocked],
    PriorityClass: [priorityClass, plain],
    Lease: [lease],
};
const details: Record<string, unknown> = {
    ReplicaSet: { ...replicaSet, ...meta },
    ReplicationController: { ...controller, ...meta },
    PodDisruptionBudget: { ...budget, ...meta },
    PriorityClass: { ...priorityClass, ...meta },
    Lease: { ...lease, ...meta },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'team-a', pods: 3, tone: 'accent' }],
    'namespace.active': { name: 'team-a', pods: 3, tone: 'accent' },
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

describe('replica set and replication controller screens', () => {
    it('lists replica sets with the controller above each one', async () => {
        renderRoutes(routeTree, '/workloads/replicasets');
        const table = await screen.findByTestId('replicasets-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', { kind: 'ReplicaSet', namespace: undefined });
        const row = table.querySelector('[data-replicaset="web-7d9"]') as HTMLElement;
        expect(within(row).getByRole('link', { name: 'web-7d9' })).toHaveAttribute(
            'href',
            '/workloads/replicasets/team-a/web-7d9',
        );
        expect(row).toHaveTextContent('Deployment/web');
        expect(row).toHaveTextContent('nginx:1.27');
    });

    it('lists replication controllers through the same columns', async () => {
        renderRoutes(routeTree, '/workloads/replicationcontrollers');
        const table = await screen.findByTestId('replicationcontrollers-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', {
            kind: 'ReplicationController',
            namespace: undefined,
        });
        const row = table.querySelector('[data-replicationcontroller="legacy"]') as HTMLElement;
        expect(within(row).getByRole('link', { name: 'legacy' })).toHaveAttribute(
            'href',
            '/workloads/replicationcontrollers/team-a/legacy',
        );
        expect(row).toHaveTextContent('busybox:1.36');
    });

    it('renders the replica set detail with its owner and its tabs', async () => {
        renderRoutes(routeTree, '/workloads/replicasets/team-a/web-7d9');
        const page = await screen.findByTestId('replicaset-page');
        await waitFor(() => expect(page).toHaveTextContent('owner: Deployment/web'));
        expect(page).toHaveTextContent('ready: 2/3');
        const rail = within(page).getByRole('tablist');
        expect(
            within(rail)
                .getAllByRole('tab')
                .map((t) => t.textContent),
        ).toEqual(['Overview', 'Events', 'ManifestYAML', 'Labels1']);
        await userEvent.click(within(rail).getByRole('tab', { name: 'Events' }));
        expect(invoke).toHaveBeenCalledWith('events.forObject', {
            kind: 'ReplicaSet',
            name: 'web-7d9',
            namespace: 'team-a',
        });
    });

    it('renders the replication controller detail', async () => {
        renderRoutes(routeTree, '/workloads/replicationcontrollers/team-a/legacy');
        const page = await screen.findByTestId('replicationcontroller-page');
        await waitFor(() => expect(page).toHaveTextContent('owner: —'));
        expect(page).toHaveTextContent('busybox:1.36');
    });
});

describe('disruption budget screens', () => {
    it('tones a budget that allows no disruption at all', async () => {
        renderRoutes(routeTree, '/workloads/disruptionbudgets');
        const table = await screen.findByTestId('disruptionbudgets-table');
        const satisfied = table.querySelector('[data-disruptionbudget="web"]') as HTMLElement;
        expect(within(satisfied).getByText('Satisfied')).toHaveAttribute('data-tone', 'ok');
        expect(satisfied).toHaveTextContent('min available 2');
        expect(satisfied).toHaveTextContent('app=web');
        const stuck = table.querySelector('[data-disruptionbudget="locked"]') as HTMLElement;
        expect(within(stuck).getByText('Blocked')).toHaveAttribute('data-tone', 'warn');
    });

    it('renders the budget detail with its counts', async () => {
        renderRoutes(routeTree, '/workloads/disruptionbudgets/team-a/web');
        const page = await screen.findByTestId('disruptionbudget-page');
        await waitFor(() => expect(page).toHaveTextContent('allowed: 1'));
        expect(within(page).getAllByText('Satisfied', { selector: '[data-tone]' })[0]).toHaveAttribute(
            'data-tone',
            'ok',
        );
        expect(within(page).getByText('Disruptions allowed')).toBeInTheDocument();
    });
});

describe('priority class and lease screens', () => {
    it('badges the global default priority class and dashes the rest', async () => {
        renderRoutes(routeTree, '/overview/priorityclasses');
        const table = await screen.findByTestId('priorityclasses-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', { kind: 'PriorityClass', namespace: undefined });
        const critical = table.querySelector('[data-priorityclass="system-critical"]') as HTMLElement;
        expect(within(critical).getByText('default')).toBeInTheDocument();
        expect(critical).toHaveTextContent('Never');
        const low = table.querySelector('[data-priorityclass="low"]') as HTMLElement;
        expect(within(low).queryByText('default')).not.toBeInTheDocument();
        expect(within(critical).getByRole('link', { name: 'system-critical' })).toHaveAttribute(
            'href',
            '/overview/priorityclasses/system-critical',
        );
    });

    it('lists leases with their holder and last renewal', async () => {
        renderRoutes(routeTree, '/overview/leases');
        const table = await screen.findByTestId('leases-table');
        const row = table.querySelector('[data-lease="kube-scheduler"]') as HTMLElement;
        expect(row).toHaveTextContent('node-1_8f2');
        expect(row).toHaveTextContent('1m ago');
        expect(within(row).getByRole('link', { name: 'kube-scheduler' })).toHaveAttribute(
            'href',
            '/overview/leases/kube-system/kube-scheduler',
        );
    });

    it('renders the cluster-scoped priority class detail and the namespaced lease detail', async () => {
        const { unmount } = renderRoutes(routeTree, '/overview/priorityclasses/system-critical');
        const priority = await screen.findByTestId('priorityclass-page');
        await waitFor(() => expect(priority).toHaveTextContent('value: 2000000'));
        expect(priority).toHaveTextContent('preemption: Never');
        // A cluster-scoped read carries no namespace at all.
        expect(invoke).toHaveBeenCalledWith('resources.get', {
            kind: 'PriorityClass',
            name: 'system-critical',
            namespace: undefined,
        });
        unmount();

        renderRoutes(routeTree, '/overview/leases/kube-system/kube-scheduler');
        const page = await screen.findByTestId('lease-page');
        await waitFor(() => expect(page).toHaveTextContent('holder: node-1_8f2'));
        expect(page).toHaveTextContent('renewed: 1m ago');
    });
});
