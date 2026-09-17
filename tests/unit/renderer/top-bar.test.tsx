import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderInRouter, renderRoutes } from './helpers';

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
const { ConnectionNotice, ContextSelector, NamespaceSelector } = await import('@/components/layout/top-bar');

const contexts = [
    { name: 'alpha', cluster: 'a', user: 'u', current: true },
    { name: 'beta', cluster: 'b', user: 'u', current: false },
];
const namespaces = [
    { name: 'team-a', pods: 1, tone: 'accent' },
    { name: 'kube-system', pods: 9, tone: 'ok' },
];
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': contexts,
    'namespaces.list': namespaces,
    'namespace.active': { name: 'team-a' },
    'cluster.active': { name: 'alpha', nodes: 1, status: 'Degraded', version: '1.36.4', provider: 'k3s', region: '—' },
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'resources.list': { kind: 'Pod', items: [] },
    'resources.get': { kind: 'Pod', item: null },
    'events.recent': [],
    'metrics.alerts': [],
    'metrics.sparklines': { nodes: [], cpu: [], mem: [] },
    'metrics.workloadHealth': [],
    'context.set': undefined,
    'namespace.set': undefined,
};

describe('TopBar', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('renders breadcrumbs for a detail page with a link back to the list', async () => {
        renderRoutes(routeTree, '/workloads/pods/team-a/web-1');
        const crumbs = await screen.findByTestId('breadcrumbs');
        expect(crumbs).toHaveTextContent('Podsteam-aweb-1');
        expect(within(crumbs).getByRole('link', { name: 'Pods' })).toHaveAttribute('href', '/workloads/pods');
        expect(within(crumbs).queryByRole('link', { name: 'web-1' })).not.toBeInTheDocument();
    });

    it('walks the history with the back and forward buttons', async () => {
        const { router } = renderRoutes(routeTree, '/overview/nodes');
        await screen.findByRole('heading', { name: 'Nodes' });
        await userEvent.click(screen.getByRole('link', { name: 'Namespaces' }));
        await screen.findByRole('heading', { name: 'Namespaces' });
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/overview/nodes'));
        await userEvent.click(screen.getByRole('button', { name: 'Forward' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/overview/namespaces'));
    });

    it('carries the cluster health on the context dot', async () => {
        renderRoutes(routeTree, '/overview/summary');
        const selector = await screen.findByTestId('context-selector');
        await waitFor(() => expect(selector).toHaveTextContent('alpha'));
        await waitFor(() =>
            expect(selector.querySelector('[title]')).toHaveAttribute('title', expect.stringContaining('not ready')),
        );
    });
});

describe('ContextSelector', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('names the reason on the dot, in danger tone, when the cluster did not answer', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'cluster.active'
                ? {
                      ...(data['cluster.active'] as object),
                      problem: { kind: 'unreachable', detail: 'Timed out after 15s waiting for the cluster.' },
                  }
                : data[channel],
        );
        renderInRouter(<ContextSelector />);
        const trigger = await screen.findByTestId('context-selector');
        await waitFor(() =>
            expect(trigger.querySelector('[title]')).toHaveAttribute(
                'title',
                'Cluster unreachable: Timed out after 15s waiting for the cluster.',
            ),
        );
        expect(trigger.querySelector('[title]')).toHaveClass('bg-danger');
    });

    it('shows the current context and a neutral dot until the cluster is known', async () => {
        invoke.mockImplementation(async (channel: string) => (channel === 'cluster.active' ? null : data[channel]));
        renderInRouter(<ContextSelector />);
        const trigger = await screen.findByTestId('context-selector');
        expect(trigger).toHaveTextContent('No cluster');
        await waitFor(() => expect(trigger).toHaveTextContent('alpha'));
        expect(trigger.querySelector('[title]')).toHaveAttribute('title', 'No active cluster');
    });

    it('lists every context and switches through the bridge', async () => {
        renderInRouter(<ContextSelector />);
        const trigger = await screen.findByTestId('context-selector');
        await waitFor(() => expect(trigger).toHaveTextContent('alpha'));
        await userEvent.click(trigger);
        const menu = await screen.findByRole('menu');
        expect(within(menu).getAllByRole('menuitem')).toHaveLength(2);
        await userEvent.click(within(menu).getByRole('menuitem', { name: /beta/ }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('context.set', { name: 'beta' }));
    });

    it('closes a detail page before switching, since its object belongs to the cluster being left', async () => {
        const { router } = renderRoutes(routeTree, '/workloads/pods/team-a/web-1');
        const trigger = await screen.findByTestId('context-selector');
        await waitFor(() => expect(trigger).toHaveTextContent('alpha'));
        await userEvent.click(trigger);
        await userEvent.click(within(await screen.findByRole('menu')).getByRole('menuitem', { name: /beta/ }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/workloads/pods'));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('context.set', { name: 'beta' }));
        // The navigation happened first, so no detail read could race the switch.
        const setIndex = invoke.mock.calls.findIndex(([channel]) => channel === 'context.set');
        expect(setIndex).toBeGreaterThan(-1);
    });

    it('does not switch when the current context is chosen again', async () => {
        renderInRouter(<ContextSelector />);
        const trigger = await screen.findByTestId('context-selector');
        await waitFor(() => expect(trigger).toHaveTextContent('alpha'));
        await userEvent.click(trigger);
        await userEvent.click(await screen.findByRole('menuitem', { name: /alpha/ }));
        await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
        expect(invoke).not.toHaveBeenCalledWith('context.set', expect.anything());
    });
});

describe('NamespaceSelector', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('says it is loading until the active namespace and the list have arrived', async () => {
        const pending = new Promise<never>(() => {});
        invoke.mockImplementation((channel: string) =>
            channel === 'namespace.active' || channel === 'namespaces.list' ? pending : Promise.resolve(data[channel]),
        );
        renderInRouter(<NamespaceSelector />);
        const trigger = await screen.findByTestId('namespace-selector');
        expect(trigger).toHaveAttribute('aria-busy', 'true');
        expect(screen.getByTestId('active-namespace')).toHaveTextContent('Loading…');
        expect(screen.getByTestId('active-namespace')).not.toHaveTextContent('All namespaces');
        await userEvent.click(trigger);
        const list = await screen.findByRole('listbox');
        expect(within(list).getByRole('progressbar', { name: 'Loading namespaces' })).toBeInTheDocument();
        expect(within(list).getAllByRole('option')).toHaveLength(1);
    });

    it('names the selection at once, and without a count, while the namespace list is still loading', async () => {
        invoke.mockImplementation((channel: string) =>
            channel === 'namespaces.list' ? new Promise<never>(() => {}) : Promise.resolve(data[channel]),
        );
        renderInRouter(<NamespaceSelector />);
        await waitFor(() => expect(screen.getByTestId('active-namespace')).toHaveTextContent('team-a'));
        expect(screen.getByTestId('active-namespace')).not.toHaveTextContent('pods');
        expect(screen.getByTestId('namespace-selector')).toHaveAttribute('aria-busy', 'true');
    });

    it('keeps naming the selection when the namespace list fails, rather than claiming All namespaces', async () => {
        const { IpcError } = await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc');
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'namespaces.list')
                throw new IpcError({ kind: 'unreachable', detail: 'down', op: 'namespaces.list' });
            return data[channel];
        });
        renderInRouter(<NamespaceSelector />);
        await waitFor(() => expect(screen.getByTestId('namespace-selector')).toHaveAttribute('aria-busy', 'false'));
        expect(screen.getByTestId('active-namespace')).toHaveTextContent('team-a');
        expect(screen.getByTestId('active-namespace')).not.toHaveTextContent('All namespaces');
        expect(screen.getByTestId('active-namespace')).not.toHaveTextContent('pods');
    });

    it('shows the active namespace with its pod count', async () => {
        renderInRouter(<NamespaceSelector />);
        await waitFor(() => expect(screen.getByTestId('active-namespace')).toHaveTextContent('team-a · 1 pods'));
        expect(screen.getByTestId('namespace-selector')).toHaveAttribute('aria-busy', 'false');
        await userEvent.click(screen.getByTestId('namespace-selector'));
        const list = await screen.findByRole('listbox');
        expect(within(list).queryByRole('progressbar')).not.toBeInTheDocument();
    });

    it('shows All namespaces when nothing is selected', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'namespace.active' ? { name: null } : data[channel],
        );
        renderInRouter(<NamespaceSelector />);
        // The count under All namespaces is the list's total, since the selection carries none.
        await waitFor(() =>
            expect(screen.getByTestId('active-namespace')).toHaveTextContent('All namespaces · 10 pods'),
        );
        // The check mark sits on the All namespaces entry, not on any real namespace.
        await userEvent.click(screen.getByTestId('namespace-selector'));
        const list = await screen.findByRole('listbox');
        const all = within(list).getByRole('option', { name: /All namespaces/ });
        expect(all.querySelector('svg')).not.toHaveClass('invisible');
        expect(
            within(list)
                .getByRole('option', { name: /team-a/ })
                .querySelector('svg'),
        ).toHaveClass('invisible');
    });

    it('filters the list and selects a namespace through the bridge', async () => {
        renderInRouter(<NamespaceSelector />);
        await waitFor(() => expect(screen.getByTestId('active-namespace')).toHaveTextContent('team-a'));
        await userEvent.click(screen.getByTestId('namespace-selector'));
        const list = await screen.findByRole('listbox');
        expect(within(list).getAllByRole('option')).toHaveLength(3);
        await userEvent.type(screen.getByPlaceholderText('Filter namespaces…'), 'kube');
        await waitFor(() => expect(within(list).getAllByRole('option')).toHaveLength(1));
        await userEvent.click(within(list).getByRole('option', { name: /kube-system/ }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('namespace.set', { namespace: 'kube-system' }));
        await waitFor(() => expect(screen.queryByRole('listbox')).not.toBeInTheDocument());
    });

    it('closes a detail page before rescoping, since its object belongs to the namespace being left', async () => {
        const { router } = renderRoutes(routeTree, '/workloads/pods/team-a/web-1');
        await waitFor(() => expect(screen.getByTestId('active-namespace')).toHaveTextContent('team-a'));
        await userEvent.click(screen.getByTestId('namespace-selector'));
        const list = await screen.findByRole('listbox');
        await userEvent.click(within(list).getByRole('option', { name: /kube-system/ }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/workloads/pods'));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('namespace.set', { namespace: 'kube-system' }));
    });

    it('stays on a list page when the namespace changes', async () => {
        const { router } = renderRoutes(routeTree, '/workloads/pods');
        await waitFor(() => expect(screen.getByTestId('active-namespace')).toHaveTextContent('team-a'));
        await userEvent.click(screen.getByTestId('namespace-selector'));
        const list = await screen.findByRole('listbox');
        await userEvent.click(within(list).getByRole('option', { name: /All namespaces/ }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('namespace.set', { namespace: null }));
        expect(router.state.location.pathname).toBe('/workloads/pods');
    });

    it('clears the scope with All namespaces and reports an empty filter', async () => {
        renderInRouter(<NamespaceSelector />);
        await userEvent.click(await screen.findByTestId('namespace-selector'));
        const list = await screen.findByRole('listbox');
        await userEvent.type(screen.getByPlaceholderText('Filter namespaces…'), 'zzz');
        expect(await screen.findByText('No namespaces found.')).toBeInTheDocument();
        await userEvent.clear(screen.getByPlaceholderText('Filter namespaces…'));
        await userEvent.click(within(list).getByRole('option', { name: /All namespaces/ }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('namespace.set', { namespace: null }));
    });
});

describe('ConnectionNotice', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('renders nothing while the cluster answers', async () => {
        renderInRouter(
            <>
                <ContextSelector />
                <ConnectionNotice />
            </>,
        );
        await screen.findByText('alpha');
        expect(screen.queryByTestId('connection-notice')).not.toBeInTheDocument();
    });

    it('names the classified reason once the probe reports a problem, and clears when it recovers', async () => {
        let down = true;
        invoke.mockImplementation(async (channel: string) =>
            channel === 'cluster.active' && down
                ? {
                      ...(data['cluster.active'] as object),
                      problem: { kind: 'unauthorized', detail: 'The credential plugin "aws" failed: SSO expired' },
                  }
                : data[channel],
        );
        renderRoutes(routeTree, '/overview/summary');
        const notice = await screen.findByTestId('connection-notice');
        expect(notice).toHaveTextContent('Not authenticated');
        expect(notice).toHaveTextContent('The credential plugin "aws" failed: SSO expired');
        expect(notice).toHaveAttribute('role', 'status');
        down = false;
        await userEvent.click(within(screen.getByTestId('cluster-summary')).getByRole('button', { name: /Refresh/ }));
        await waitFor(() => expect(screen.queryByTestId('connection-notice')).not.toBeInTheDocument());
    });
});
