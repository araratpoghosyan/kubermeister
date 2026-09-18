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

const account = { name: 'builder', namespace: 'team-a', secrets: 1, age: '2h' };
const role = { name: 'reader', namespace: 'team-a', rules: 2, age: '2h' };
const roleBinding = {
    name: 'reader-binding',
    namespace: 'team-a',
    role: 'Role/reader',
    subjects: 1,
    age: '2h',
};
const clusterRole = { name: 'cluster-admin', rules: 1, aggregated: false, age: '2h' };
const clusterRoleBinding = { name: 'admins', role: 'ClusterRole/cluster-admin', subjects: 2, age: '2h' };
const meta = { labels: [['tier', 'ci']], annotations: [] };
const rows: Record<string, unknown[]> = {
    ServiceAccount: [account],
    Role: [role],
    RoleBinding: [roleBinding],
    ClusterRole: [clusterRole, { ...clusterRole, name: 'view', rules: 0, aggregated: true }],
    ClusterRoleBinding: [clusterRoleBinding],
};
const details: Record<string, unknown> = {
    ServiceAccount: { ...account, ...meta },
    Role: { ...role, ...meta },
    RoleBinding: { ...roleBinding, ...meta },
    ClusterRole: { ...clusterRole, ...meta },
    ClusterRoleBinding: { ...clusterRoleBinding, ...meta },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'team-a', tone: 'accent' }],
    'namespace.active': { name: 'team-a' },
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

describe('access lists', () => {
    it('lists service accounts, roles and role bindings with links that carry the namespace', async () => {
        renderRoutes(routeTree, '/access/serviceaccounts');
        const accounts = await screen.findByTestId('serviceaccounts-table');
        const accountRow = accounts.querySelector('[data-serviceaccount="builder"]') as HTMLElement;
        expect(within(accountRow).getByRole('link', { name: 'builder' })).toHaveAttribute(
            'href',
            '/access/serviceaccounts/team-a/builder',
        );
        expect(accountRow).toHaveTextContent('1');

        await userEvent.click(screen.getByRole('link', { name: 'Roles', exact: true }));
        const roles = await screen.findByTestId('roles-table');
        expect(roles.querySelector('[data-role="reader"]')).toHaveTextContent('2');

        await userEvent.click(screen.getByRole('link', { name: 'Role Bindings' }));
        const bindings = await screen.findByTestId('rolebindings-table');
        expect(bindings.querySelector('[data-rolebinding="reader-binding"]')).toHaveTextContent('Role/reader');
    });

    it('lists the cluster-scoped roles and bindings without a namespace in their links', async () => {
        renderRoutes(routeTree, '/access/clusterroles');
        const roles = await screen.findByTestId('clusterroles-table');
        const adminRow = roles.querySelector('[data-clusterrole="cluster-admin"]') as HTMLElement;
        expect(within(adminRow).getByRole('link', { name: 'cluster-admin' })).toHaveAttribute(
            'href',
            '/access/clusterroles/cluster-admin',
        );
        // Only a role whose rules come from an aggregation selector carries the badge.
        expect(adminRow).toHaveTextContent('—');
        expect(roles.querySelector('[data-clusterrole="view"]')).toHaveTextContent('aggregated');

        await userEvent.click(screen.getByRole('link', { name: 'Cluster Role Bindings' }));
        const bindings = await screen.findByTestId('clusterrolebindings-table');
        expect(bindings.querySelector('[data-clusterrolebinding="admins"]')).toHaveTextContent(
            'ClusterRole/cluster-admin',
        );
    });
});

describe('access details', () => {
    it('shows the namespaced details and asks for them with their namespace', async () => {
        renderRoutes(routeTree, '/access/serviceaccounts/team-a/builder');
        const accountPage = await screen.findByTestId('serviceaccount-page');
        await waitFor(() => expect(accountPage).toHaveTextContent('secrets: 1'));
        expect(invoke).toHaveBeenCalledWith('resources.get', {
            kind: 'ServiceAccount',
            name: 'builder',
            namespace: 'team-a',
        });

        renderRoutes(routeTree, '/access/roles/team-a/reader');
        const rolePage = await screen.findByTestId('role-page');
        await waitFor(() => expect(rolePage).toHaveTextContent('rules: 2'));

        renderRoutes(routeTree, '/access/rolebindings/team-a/reader-binding');
        const bindingPage = await screen.findByTestId('rolebinding-page');
        await waitFor(() => expect(bindingPage).toHaveTextContent('role: Role/reader'));
        expect(bindingPage).toHaveTextContent('Subjects');
    });

    it('shows the cluster-scoped details without a namespace and reports a missing one', async () => {
        renderRoutes(routeTree, '/access/clusterroles/cluster-admin');
        const rolePage = await screen.findByTestId('clusterrole-page');
        await waitFor(() => expect(rolePage).toHaveTextContent('rules: 1'));
        expect(rolePage).toHaveTextContent('aggregated: false');
        expect(invoke).toHaveBeenCalledWith('resources.get', {
            kind: 'ClusterRole',
            name: 'cluster-admin',
            namespace: undefined,
        });

        const { router } = renderRoutes(routeTree, '/access/clusterrolebindings/admins');
        const bindingPage = await screen.findByTestId('clusterrolebinding-page');
        await waitFor(() => expect(bindingPage).toHaveTextContent('subjects: 2'));

        invoke.mockImplementation(async (channel: string, input: { kind?: string }) =>
            channel === 'resources.get' ? { kind: input.kind, item: null } : data[channel],
        );
        await router.navigate({ to: '/access/clusterrolebindings/$name', params: { name: 'ghost' } });
        expect(await screen.findByTestId('not-found')).toHaveTextContent('ClusterRoleBinding “ghost” was not found.');
    });
});
