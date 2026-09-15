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

describe('Sidebar', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.classList.remove('light', 'dark');
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'update.state') return { status: 'up-to-date' };
            if (channel === 'resources.list') return { kind: 'Pod', items: [] };
            return channel.endsWith('.list') ? [] : null;
        });
    });

    it('shows every domain open with the current item marked', async () => {
        renderRoutes(routeTree, '/workloads/pods');
        const sidebar = await screen.findByTestId('sidebar');
        expect(within(sidebar).getByRole('link', { name: 'Pods' })).toHaveAttribute('aria-current', 'page');
        expect(within(sidebar).getByRole('link', { name: 'Nodes' })).not.toHaveAttribute('aria-current');
        expect(within(sidebar).getByRole('button', { name: 'Workloads' })).toHaveAttribute('aria-expanded', 'true');
        expect(within(sidebar).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-expanded', 'true');
        for (const label of ['COMPUTE', 'BATCH', 'CONFIG', 'TRAFFIC', 'POLICY'])
            expect(sidebar).toHaveTextContent(label);
        expect(
            within(sidebar)
                .getAllByRole('link')
                .map((l) => l.textContent),
        ).toEqual([
            'Cluster summary',
            'Nodes',
            'Namespaces',
            'Events stream',
            'Quotas',
            'Limits',
            'Pods',
            'Deployments',
            'StatefulSets',
            'DaemonSets',
            'Jobs',
            'CronJobs',
            'ConfigMaps',
            'Secrets',
            'Autoscalers',
            'Services',
            'Ingresses',
            'Endpoints',
            'NetworkPolicies',
            'Settings',
        ]);
    });

    it('collapses and expands a domain on demand and keeps the choice across navigation', async () => {
        renderRoutes(routeTree, '/overview/nodes');
        const sidebar = await screen.findByTestId('sidebar');
        const section = (name: string) => within(sidebar).getByRole('button', { name });
        await userEvent.click(section('Workloads'));
        expect(within(sidebar).queryByRole('link', { name: 'Pods' })).not.toBeInTheDocument();
        await userEvent.click(within(sidebar).getByRole('link', { name: 'Cluster summary' }));
        await waitFor(() =>
            expect(within(sidebar).getByRole('link', { name: 'Cluster summary' })).toHaveAttribute(
                'aria-current',
                'page',
            ),
        );
        expect(section('Workloads')).toHaveAttribute('aria-expanded', 'false');
        await userEvent.click(section('Workloads'));
        expect(within(sidebar).getByRole('link', { name: 'Pods' })).toBeInTheDocument();
    });

    it('reopens a collapsed domain when navigation enters it', async () => {
        const { router } = renderRoutes(routeTree, '/overview/nodes');
        const sidebar = await screen.findByTestId('sidebar');
        await userEvent.click(within(sidebar).getByRole('button', { name: 'Workloads' }));
        expect(within(sidebar).queryByRole('link', { name: 'Pods' })).not.toBeInTheDocument();
        await router.navigate({ to: '/workloads/pods' });
        expect(await within(sidebar).findByRole('link', { name: 'Pods' })).toHaveAttribute('aria-current', 'page');
        expect(within(sidebar).getByRole('button', { name: 'Overview' })).toHaveAttribute('aria-expanded', 'true');
    });

    it('shows Quick actions and the Settings entry in the footer, with the macOS hint only on a Mac', async () => {
        renderRoutes(routeTree, '/overview/summary');
        const sidebar = await screen.findByTestId('sidebar');
        expect(within(sidebar).getByTestId('quick-actions')).toHaveTextContent('Quick actions⌘K');
        const settings = within(sidebar).getByRole('link', { name: /Settings/ });
        expect(settings).toHaveAttribute('href', '/settings');
        expect(settings).not.toHaveAttribute('aria-current');
        // jsdom reports no Mac platform, so the ⌘, hint stays hidden here.
        expect(settings).not.toHaveTextContent('⌘,');
        expect(within(sidebar).queryByTestId('theme-toggle')).not.toBeInTheDocument();
    });
});
