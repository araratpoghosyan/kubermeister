import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRouter, RouterProvider } from '@tanstack/react-router';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const invoke = vi.fn();
const subscribe = vi.fn(() => () => {});
vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke,
    subscribe,
}));

const { routeTree } = await import('@/routeTree.gen');
const { LoadingRows } = await import('@/components/overview/query-state');

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
};

function renderAt(path: string) {
    const router = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: [path] }) });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={client}>
            <RouterProvider router={router} />
        </QueryClientProvider>,
    );
}

describe('app shell', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('renders the sidebar, the top bar with context and namespace, and the summary at the root', async () => {
        renderAt('/');
        expect(await screen.findByTestId('summary-page')).toBeInTheDocument();
        expect(await screen.findByTestId('cluster-summary')).toHaveTextContent('alpha');
        expect(screen.getByTestId('sidebar')).toHaveTextContent('Kubermeister');
        expect(screen.getByRole('link', { name: 'Summary' })).toHaveAttribute('aria-current', 'page');
        expect(await screen.findByTestId('active-namespace')).toHaveTextContent('team-a · 4 pods');
        expect(await screen.findByTestId('context-selector')).toHaveTextContent('alpha');
        expect(screen.queryByTestId('update-banner')).not.toBeInTheDocument();
    });

    it('navigates between the overview screens through the sidebar', async () => {
        renderAt('/overview/nodes');
        const nodes = await screen.findByTestId('nodes-table');
        expect(within(nodes).getAllByRole('row')).toHaveLength(2);
        expect(nodes).toHaveTextContent('control-plane');
        await userEvent.click(screen.getByRole('link', { name: 'Namespaces' }));
        const namespaces = await screen.findByTestId('namespaces-table');
        expect(namespaces).toHaveTextContent('kube-system');
        expect(screen.getByRole('link', { name: 'Namespaces' })).toHaveAttribute('aria-current', 'page');
    });

    it('shows a classified error inside the page when a read fails', async () => {
        const { IpcError } = await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc');
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'nodes.list')
                throw new IpcError({ kind: 'forbidden', detail: 'Access denied (RBAC).', op: 'nodes.list' });
            return data[channel];
        });
        renderAt('/overview/nodes');
        expect(await screen.findByRole('alert')).toHaveTextContent('Access denied');
    });

    it('renders an unknown route as not found', async () => {
        renderAt('/nowhere');
        expect(await screen.findByText('This page does not exist.')).toBeInTheDocument();
    });
});

describe('LoadingRows', () => {
    it('renders the requested number of skeleton rows', () => {
        render(<LoadingRows rows={4} />);
        expect(screen.getByRole('status', { name: 'Loading' }).children).toHaveLength(4);
    });
});
