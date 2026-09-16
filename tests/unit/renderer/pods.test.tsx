import { screen, waitFor, within } from '@testing-library/react';
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

const row = {
    name: 'web-1',
    namespace: 'team-a',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    age: '3d',
    node: 'n1',
    cpu: 250,
    mem: 64,
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
            role: 'app',
            cpuUsed: null,
            memUsed: null,
            cpuRequested: null,
            memRequested: null,
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
            role: 'app',
            cpuUsed: null,
            memUsed: null,
            cpuRequested: null,
            memRequested: null,
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
    'resources.list': {
        kind: 'Pod',
        items: [row, { ...row, name: 'web-2', status: 'CrashLoop', restarts: 5, cpuLimit: 0, memLimit: 0 }],
    },
    'resources.get': { kind: 'Pod', item: detail },
    'pods.logSnapshot': [],
    'metrics.podSeries': { cpu: [100, 250], mem: [60, 64] },
    'events.forObject': [
        {
            time: '12:00:05',
            type: 'Warning',
            reason: 'BackOff',
            object: 'pod/web-1',
            namespace: 'team-a',
            message: 'restarting',
        },
    ],
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
        const web1 = table.querySelector('[data-pod="web-1"]') as HTMLElement;
        const web2 = table.querySelector('[data-pod="web-2"]') as HTMLElement;
        expect(web2).toHaveTextContent('5');
        expect(within(web2).getByText('5')).toHaveClass('text-warn');
        expect(within(web1).getByText('0')).toHaveClass('text-text-muted');
        expect(within(web1).getByText('1/1')).toHaveClass('text-ok');
        expect(within(web2).getByText('1/1')).toHaveClass('text-danger');
        expect(within(web1).getByRole('progressbar', { name: 'CPU usage' })).toHaveAttribute('aria-valuenow', '50');
        expect(within(web1).getByRole('progressbar', { name: 'Memory usage' })).toHaveAttribute('aria-valuenow', '50');
        expect(web1).toHaveTextContent('250m');
        expect(web1).toHaveTextContent('64Mi');
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

    it('loads a pod by namespace and name and renders the railed detail', async () => {
        renderRoutes(routeTree, '/workloads/pods/team-a/web-1');
        const page = await screen.findByTestId('pod-page');
        await waitFor(() => expect(page).toHaveTextContent('namespace: team-a'));
        expect(invoke).toHaveBeenCalledWith('resources.get', { kind: 'Pod', name: 'web-1', namespace: 'team-a' });
        expect(within(page).getAllByText('Running', { selector: '[data-tone]' })[0]).toHaveAttribute('data-tone', 'ok');
        expect(page).toHaveTextContent('age: 3d');
        const rail = within(page).getByRole('tablist');
        expect(
            within(rail)
                .getAllByRole('tab')
                .map((tab) => tab.textContent),
        ).toEqual(['Overview', 'Logs', 'Events', 'ManifestYAML', 'Labels1', 'Network1', 'Shell']);
        expect(within(page).getByTestId('containers')).toHaveTextContent('nginx:1.27');
        await waitFor(() => expect(page).toHaveTextContent('250m'));
        expect(page).toHaveTextContent('64Mi');
        expect(invoke).toHaveBeenCalledWith('metrics.podSeries', { namespace: 'team-a', name: 'web-1' });
        await userEvent.click(within(rail).getByRole('tab', { name: /Labels/ }));
        expect(within(page).getByText('web')).toBeInTheDocument();
        await userEvent.click(within(rail).getByRole('tab', { name: /Events/ }));
        expect(await within(page).findByText('BackOff')).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith('events.forObject', { kind: 'Pod', name: 'web-1', namespace: 'team-a' });
    });

    it('reports a missing pod as not found', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'resources.get' ? { kind: 'Pod', item: null } : data[channel],
        );
        renderRoutes(routeTree, '/workloads/pods/team-a/gone');
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'Pod “gone” was not found in namespace “team-a”.',
        );
        expect(screen.getByRole('link', { name: 'Back to list' })).toHaveAttribute('href', '/workloads/pods');
    });
});
