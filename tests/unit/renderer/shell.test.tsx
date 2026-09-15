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

const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', namespace: 'team-a', current: true }],
    'namespace.active': { name: 'team-a', pods: 4, tone: 'accent' },
    'cluster.active': { name: 'alpha', nodes: 1, status: 'Healthy', version: '1.36.4', provider: 'k3s', region: '—' },
    'nodes.list': [
        {
            name: 'n1',
            status: 'Ready',
            role: 'control-plane',
            version: 'v1.36',
            cpu: 4,
            memory: 7.8,
            cpuUsed: 25,
            memUsed: null,
            pods: 4,
            age: '3d',
            instanceType: 'k3s',
        },
    ],
    'namespaces.list': [
        { name: 'team-a', pods: 4, tone: 'accent' },
        { name: 'kube-system', pods: 9, tone: 'ok' },
    ],
    'resources.list': { kind: 'Pod', items: [] },
    'events.recent': [],
    'metrics.alerts': [],
    'metrics.sparklines': { nodes: [1], cpu: [5], mem: [10] },
    'metrics.workloadHealth': [],
};

describe('app shell', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('renders the sidebar, the top bar with context and namespace, and the summary at the root', async () => {
        renderRoutes(routeTree, '/');
        const summary = await screen.findByTestId('cluster-summary');
        await waitFor(() => expect(summary).toHaveTextContent('alpha'));
        expect(within(summary).getByText('Healthy', { selector: '[data-tone]' })).toHaveAttribute('data-tone', 'ok');
        expect(summary).toHaveTextContent('k3s · v1.36.4 · —');
        expect(screen.getByTestId('sidebar')).toHaveTextContent('Kubermeister');
        expect(screen.getByRole('link', { name: 'Cluster summary' })).toHaveAttribute('aria-current', 'page');
        expect(await screen.findByTestId('active-namespace')).toHaveTextContent('team-a · 4 pods');
        expect(await screen.findByTestId('context-selector')).toHaveTextContent('alpha');
        expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Cluster summary');
        expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    });

    it('navigates between the overview screens through the sidebar', async () => {
        renderRoutes(routeTree, '/overview/nodes');
        const nodes = await screen.findByTestId('nodes-table');
        expect(within(nodes).getAllByRole('row')).toHaveLength(2);
        expect(nodes).toHaveTextContent('control-plane');
        expect(within(nodes).getByText('Ready')).toHaveAttribute('data-tone', 'ok');
        await userEvent.click(screen.getByRole('link', { name: 'Namespaces' }));
        const namespaces = await screen.findByTestId('namespaces-table');
        expect(namespaces).toHaveTextContent('kube-system');
        expect(within(namespaces).getByText('Active')).toHaveAttribute('data-tone', 'accent');
        expect(namespaces.querySelector('[data-namespace="kube-system"]')).toHaveTextContent('Ready');
        expect(screen.getByRole('link', { name: 'Namespaces' })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Namespaces');
    });

    it('shows a classified error inside the list when a read fails and retries on demand', async () => {
        const { IpcError } = await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc');
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'nodes.list')
                throw new IpcError({ kind: 'forbidden', detail: 'Access denied (RBAC).', op: 'nodes.list' });
            return data[channel];
        });
        renderRoutes(routeTree, '/overview/nodes');
        expect(await screen.findByText('Access denied')).toBeInTheDocument();
        expect(screen.getByText("You don't have permission to view Nodes.")).toBeInTheDocument();
        invoke.mockImplementation(async (channel: string) => data[channel]);
        await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
        expect(await screen.findByTestId('nodes-table')).toHaveTextContent('n1');
    });

    it('renders an unknown route as not found', async () => {
        renderRoutes(routeTree, '/nowhere');
        expect(await screen.findByText('This page does not exist.')).toBeInTheDocument();
    });
});
