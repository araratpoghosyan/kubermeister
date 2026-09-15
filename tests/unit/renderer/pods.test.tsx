import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodDetail as PodDetailModel } from '../../../src/shared/k8s/pods';
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
const { PodDetail } = await import('@/components/workloads/pod-detail');

const row = {
    name: 'web-1',
    namespace: 'team-a',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    age: '3d',
    node: 'n1',
    cpuLimit: 500,
    memLimit: 128,
};
const detail: PodDetailModel = {
    ...row,
    status: 'Running',
    podIP: '10.0.0.5',
    hostIP: '192.168.1.2',
    qos: 'Burstable',
    dnsPolicy: 'ClusterFirst',
    serviceAccount: 'default',
    conditions: [
        { type: 'Ready', ok: true, time: '1h ago' },
        { type: 'PodScheduled', ok: false, time: '—' },
    ],
    containers: [
        {
            name: 'app',
            image: 'nginx:1.27',
            imageId: 'abc',
            pullPolicy: 'IfNotPresent',
            state: 'Running',
            started: '2h ago',
            restarts: 0,
            cpuRequest: '100m',
            cpuLimit: '500m',
            memRequest: '—',
            memLimit: '128Mi',
            ports: ['80/TCP'],
            probes: [{ kind: 'Readiness', spec: 'httpGet /:80 · 10s' }],
        },
        {
            name: 'sidecar',
            image: 'busybox',
            imageId: '—',
            pullPolicy: 'Always',
            state: 'CrashLoop',
            started: '—',
            restarts: 7,
            cpuRequest: '—',
            cpuLimit: '—',
            memRequest: '—',
            memLimit: '—',
            ports: [],
            probes: [],
        },
    ],
    labels: [['app', 'web']],
    annotations: [],
};

const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'namespaces.list': [
        { name: 'team-a', pods: 1, tone: 'accent' },
        { name: 'kube-system', pods: 9, tone: 'ok' },
    ],
    'namespace.active': { name: 'team-a', pods: 1, tone: 'accent' },
    'resources.list': { kind: 'Pod', items: [row, { ...row, name: 'web-2', status: 'CrashLoop', restarts: 5 }] },
    'resources.get': { kind: 'Pod', item: detail },
};

describe('pods screens', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('lists pods with status tones and links each row to its namespaced detail', async () => {
        renderRoutes(routeTree, '/workloads/pods');
        const table = await screen.findByTestId('pods-table');
        expect(within(table).getAllByRole('row')).toHaveLength(3);
        expect(within(table).getByText('CrashLoop')).toHaveAttribute('data-tone', 'danger');
        expect(within(table).getByRole('link', { name: 'web-1' })).toHaveAttribute(
            'href',
            '/workloads/pods/team-a/web-1',
        );
        expect(table.querySelector('[data-pod="web-2"]')).toHaveTextContent('5');
        expect(invoke).toHaveBeenCalledWith('resources.list', { kind: 'Pod', namespace: undefined });
        expect(screen.getByRole('link', { name: 'Pods' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('resource-list')).toHaveTextContent('2 results');
    });

    it('opens the detail when a row is clicked', async () => {
        const { router } = renderRoutes(routeTree, '/workloads/pods');
        const table = await screen.findByTestId('pods-table');
        await userEvent.click(within(table).getByText('CrashLoop'));
        await waitFor(() => expect(router.state.location.pathname).toBe('/workloads/pods/team-a/web-2'));
    });

    it('shows the namespace selector with the active namespace', async () => {
        renderRoutes(routeTree, '/workloads/pods');
        const selector = await screen.findByTestId('namespace-selector');
        await waitFor(() => expect(selector).toHaveTextContent('team-a'));
    });

    it('loads a pod by namespace and name and renders the detail with its header', async () => {
        renderRoutes(routeTree, '/workloads/pods/team-a/web-1');
        expect(await screen.findByTestId('pod-detail')).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith('resources.get', { kind: 'Pod', name: 'web-1', namespace: 'team-a' });
        const page = screen.getByTestId('pod-page');
        expect(page).toHaveTextContent('Pod');
        expect(within(page).getAllByText('Running')[0]).toHaveAttribute('data-tone', 'ok');
        expect(page).toHaveTextContent('1/1 ready');
    });

    it('reports a missing pod as not found', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'resources.get' ? { kind: 'Pod', item: null } : data[channel],
        );
        renderRoutes(routeTree, '/workloads/pods/team-a/gone');
        expect(await screen.findByTestId('not-found')).toHaveTextContent('Pod team-a/gone does not exist.');
    });
});

describe('PodDetail', () => {
    it('renders facts, containers with tones, conditions, labels and an empty annotations state', () => {
        render(<PodDetail pod={detail} />);
        expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
        const containers = screen.getByTestId('containers-table');
        expect(within(containers).getAllByRole('row')).toHaveLength(3);
        expect(within(containers).getByText('CrashLoop')).toHaveAttribute('data-tone', 'danger');
        expect(containers).toHaveTextContent('Readiness: httpGet /:80 · 10s');
        expect(containers).toHaveTextContent('100m / 500m');
        const conditions = screen.getByTestId('conditions');
        expect(within(conditions).getByText('True')).toHaveAttribute('data-tone', 'ok');
        expect(within(conditions).getByText('False')).toHaveAttribute('data-tone', 'warn');
        expect(screen.getByText('web')).toBeInTheDocument(); // the label value
        expect(screen.getAllByText('None')).toHaveLength(2); // empty annotations: description and body
        expect(screen.getByText('1 entry')).toBeInTheDocument();
    });
});
