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
    'settings.get': {
        version: 1,
        session: { lastContext: null, lastNamespace: null, restoreOnLaunch: true },
        connection: { kubeconfigPath: null },
        data: { refreshIntervalSec: 12 },
    },
    'contexts.list': [
        { name: 'alpha', cluster: 'a', user: 'u', current: true },
        { name: 'beta', cluster: 'b', user: 'u', current: false },
    ],
    'namespaces.list': [
        { name: 'team-a', pods: 4, tone: 'accent' },
        { name: 'kube-system', pods: 9, tone: 'ok' },
    ],
    'namespace.active': { name: 'team-a', pods: 4, tone: 'accent' },
    'cluster.active': null,
    'nodes.list': [],
    'namespaces.list_': [],
    'events.recent': [],
    'metrics.alerts': [],
    'metrics.sparklines': { nodes: [], cpu: [], mem: [] },
    'metrics.workloadHealth': [],
    'resources.list': { kind: 'Pod', items: [] },
    'context.set': undefined,
    'namespace.set': undefined,
};

describe('command palette', () => {
    beforeEach(() => {
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => data[channel]);
    });

    it('opens from the sidebar button and from the keyboard, and closes again', async () => {
        renderRoutes(routeTree, '/overview/summary');
        await userEvent.click(await screen.findByTestId('quick-actions'));
        const dialog = await screen.findByRole('dialog', { name: 'Quick actions' });
        expect(within(dialog).getByPlaceholderText('Switch cluster, namespace or resource…')).toBeInTheDocument();
        await userEvent.keyboard('{Escape}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        await userEvent.keyboard('{Meta>}k{/Meta}');
        expect(await screen.findByRole('dialog', { name: 'Quick actions' })).toBeInTheDocument();
        await userEvent.keyboard('{Control>}k{/Control}');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('lists contexts, namespaces, the coming-soon action and every screen', async () => {
        renderRoutes(routeTree, '/overview/summary');
        await userEvent.keyboard('{Control>}k{/Control}');
        const dialog = await screen.findByRole('dialog', { name: 'Quick actions' });
        await waitFor(() => expect(within(dialog).getByRole('option', { name: /beta/ })).toBeInTheDocument());
        expect(within(dialog).getByRole('option', { name: /kube-system/ })).toHaveTextContent('9 pods');
        expect(within(dialog).getByRole('option', { name: /Create resource/ })).toHaveAttribute(
            'aria-disabled',
            'true',
        );
        for (const label of ['Cluster summary', 'Nodes', 'Namespaces', 'Pods', 'Jobs', 'Autoscalers', 'Settings']) {
            expect(within(dialog).getByRole('option', { name: label })).toBeInTheDocument();
        }
    });

    it('switches context and namespace through the bridge and closes', async () => {
        renderRoutes(routeTree, '/overview/summary');
        await userEvent.keyboard('{Control>}k{/Control}');
        const dialog = await screen.findByRole('dialog', { name: 'Quick actions' });
        await userEvent.click(await within(dialog).findByRole('option', { name: /beta/ }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('context.set', { name: 'beta' }));
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

        await userEvent.keyboard('{Control>}k{/Control}');
        const again = await screen.findByRole('dialog', { name: 'Quick actions' });
        await userEvent.click(await within(again).findByRole('option', { name: /kube-system/ }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('namespace.set', { namespace: 'kube-system' }));
    });

    it('filters and navigates to a screen', async () => {
        const { router } = renderRoutes(routeTree, '/overview/summary');
        await userEvent.keyboard('{Control>}k{/Control}');
        const dialog = await screen.findByRole('dialog', { name: 'Quick actions' });
        await userEvent.type(within(dialog).getByPlaceholderText('Switch cluster, namespace or resource…'), 'nodes');
        await waitFor(() => expect(within(dialog).getAllByRole('option')).toHaveLength(1));
        await userEvent.click(within(dialog).getByRole('option', { name: 'Nodes' }));
        await waitFor(() => expect(router.state.location.pathname).toBe('/overview/nodes'));
        expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });
});
