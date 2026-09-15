import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, screen, waitFor, within } from '@testing-library/react';
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
const { useRefreshIntervalMs } = await import('@/lib/settings');

const settings = {
    version: 1,
    session: { lastContext: 'alpha', lastNamespace: 'team-a', restoreOnLaunch: true },
    connection: { kubeconfigPath: null },
    data: { refreshIntervalSec: 12 },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'settings.get': settings,
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'namespaces.list': [],
    'namespace.active': null,
    'cluster.active': null,
};

describe('settings screen', () => {
    beforeEach(() => {
        localStorage.clear();
        document.documentElement.classList.remove('light', 'dark');
        invoke.mockReset();
        invoke.mockImplementation(async (channel: string, input: unknown) => {
            if (channel === 'settings.set') {
                const patch = input as { session?: object; data?: object };
                return {
                    ...settings,
                    session: { ...settings.session, ...patch.session },
                    data: { ...settings.data, ...patch.data },
                };
            }
            return data[channel];
        });
    });

    it('is reachable from the sidebar footer and shows the three sections', async () => {
        renderRoutes(routeTree, '/overview/summary');
        const sidebar = await screen.findByTestId('sidebar');
        await userEvent.click(within(sidebar).getByRole('link', { name: /Settings/ }));
        const page = await screen.findByTestId('settings-page');
        expect(page).toHaveTextContent('Preferences for this Kubermeister install.');
        for (const title of ['General', 'Appearance', 'Connection']) expect(page).toHaveTextContent(title);
        expect(within(sidebar).getByRole('link', { name: /Settings/ })).toHaveAttribute('aria-current', 'page');
        expect(screen.getByTestId('breadcrumbs')).toHaveTextContent('Settings');
    });

    it('writes the session toggle and the refresh interval through the bridge', async () => {
        renderRoutes(routeTree, '/settings');
        const toggle = await screen.findByRole('switch', { name: 'Restore last session on launch' });
        await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
        await userEvent.click(toggle);
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('settings.set', { session: { restoreOnLaunch: false } }),
        );
        await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));

        await userEvent.click(screen.getByRole('combobox'));
        await userEvent.click(await screen.findByRole('option', { name: '30 seconds' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('settings.set', { data: { refreshIntervalSec: 30 } }));
        expect(screen.getByRole('combobox')).toHaveTextContent('30 seconds');
    });

    it('offers the preset intervals plus the current non-preset value', async () => {
        renderRoutes(routeTree, '/settings');
        await screen.findByTestId('settings-page');
        await userEvent.click(screen.getByRole('combobox'));
        const options = (await screen.findAllByRole('option')).map((o) => o.textContent);
        expect(options).toEqual(['5 seconds', '10 seconds', '12 seconds', '15 seconds', '30 seconds', '60 seconds']);
    });

    it('switches the theme from the cards and persists it', async () => {
        renderRoutes(routeTree, '/settings');
        const group = await screen.findByRole('radiogroup', { name: 'Theme' });
        expect(within(group).getByRole('radio', { name: /Dark/ })).toHaveAttribute('aria-checked', 'true');
        await userEvent.click(within(group).getByRole('radio', { name: /Light/ }));
        expect(document.documentElement).toHaveClass('light');
        expect(localStorage.getItem('km-theme')).toBe('light');
        expect(within(group).getByRole('radio', { name: /Light/ })).toHaveAttribute('aria-checked', 'true');
    });

    it('picks a kubeconfig through the native dialog and resets to the default', async () => {
        let path: string | null = null;
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'kubeconfig.pick') {
                path = '/tmp/other';
                return { path };
            }
            if (channel === 'kubeconfig.useDefault') {
                path = null;
                return { ...settings, connection: { kubeconfigPath: null } };
            }
            if (channel === 'settings.get') return { ...settings, connection: { kubeconfigPath: path } };
            return data[channel];
        });
        renderRoutes(routeTree, '/settings');
        const shown = await screen.findByTestId('kubeconfig-path');
        expect(shown).toHaveTextContent('$KUBECONFIG or ~/.kube/config (default)');
        expect(screen.getByRole('button', { name: 'Use default' })).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'Browse…' }));
        await waitFor(() => expect(shown).toHaveTextContent('/tmp/other'));
        expect(invoke).toHaveBeenCalledWith('kubeconfig.pick', {});
        await userEvent.click(screen.getByRole('button', { name: 'Use default' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('kubeconfig.useDefault', {}));
        await waitFor(() => expect(shown).toHaveTextContent('(default)'));
    });

    it('ignores a cancelled dialog', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'kubeconfig.pick' ? { path: null } : data[channel],
        );
        renderRoutes(routeTree, '/settings');
        await userEvent.click(await screen.findByRole('button', { name: 'Browse…' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('kubeconfig.pick', {}));
        expect(invoke.mock.calls.filter(([c]) => c === 'settings.get')).toHaveLength(1);
    });
});

describe('useRefreshIntervalMs', () => {
    it('falls back while settings load and then follows the persisted interval', async () => {
        invoke.mockReset();
        let resolve!: (value: unknown) => void;
        invoke.mockImplementation(() => new Promise((r) => (resolve = r)));
        const client = new QueryClient();
        const { result } = renderHook(() => useRefreshIntervalMs(5_000), {
            wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
        });
        expect(result.current).toBe(5_000);
        resolve({ ...settings, data: { refreshIntervalSec: 30 } });
        await waitFor(() => expect(result.current).toBe(30_000));
    });
});
