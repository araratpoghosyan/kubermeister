import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StartupReport } from '../../../src/shared/ipc';
import { renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({ ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')), invoke }));

const { StartupGate } = await import('@/components/startup-gate');

const passing: StartupReport = {
    ok: true,
    checks: [
        { id: 'kubeconfig', label: 'Kubeconfig file', status: 'ok' },
        { id: 'cluster', label: 'Cluster connection', status: 'ok' },
    ],
};
const failing: StartupReport = {
    ok: false,
    checks: [
        {
            id: 'kubeconfig',
            label: 'Kubeconfig file',
            status: 'error',
            detail: 'No file exists at /k.',
            hint: 'Fix or clear the kubeconfig path in Settings.',
        },
        { id: 'cluster', label: 'Cluster connection', status: 'warning', detail: 'Skipped' },
    ],
};

describe('StartupGate', () => {
    beforeEach(() => {
        invoke.mockReset();
    });

    it('shows the preloader, then the app once the checks pass and the namespaces are primed', async () => {
        const order: string[] = [];
        invoke.mockImplementation(async (channel: string) => {
            order.push(channel);
            if (channel === 'startupChecks') return passing;
            if (channel === 'namespaces.list') return [{ name: 'team-a', tone: 'accent' }];
            throw new Error(`unexpected ${channel}`);
        });
        const { client } = renderWithQuery(
            <StartupGate>
                <p>the app</p>
            </StartupGate>,
        );
        expect(screen.getByRole('status')).toBeInTheDocument();
        expect(await screen.findByText('the app')).toBeInTheDocument();
        expect(order).toEqual(['startupChecks', 'namespaces.list']);
        // The list is in the cache before the shell mounts, so the selector opens populated.
        expect(client.getQueryData(['namespaces.list', {}])).toEqual([{ name: 'team-a', tone: 'accent' }]);
    });

    it('does not wait for namespaces when the probe could not reach the cluster', async () => {
        const offline: StartupReport = {
            ok: true,
            checks: [
                { id: 'kubeconfig', label: 'Kubeconfig file', status: 'ok' },
                { id: 'cluster', label: 'Cluster connection', status: 'warning', detail: 'unreachable' },
            ],
        };
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'startupChecks') return offline;
            return new Promise(() => {});
        });
        renderWithQuery(
            <StartupGate>
                <p>the app</p>
            </StartupGate>,
        );
        expect(await screen.findByText('the app')).toBeInTheDocument();
        expect(invoke).not.toHaveBeenCalledWith('namespaces.list', {});
    });

    it('lets the app in when the namespace prime fails', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'startupChecks') return passing;
            throw new Error('namespaces denied');
        });
        renderWithQuery(
            <StartupGate>
                <p>the app</p>
            </StartupGate>,
        );
        expect(await screen.findByText('the app')).toBeInTheDocument();
    });

    it('shows the failing checks with details and hints, and retries on demand', async () => {
        invoke.mockResolvedValueOnce(failing).mockResolvedValueOnce(passing);
        renderWithQuery(
            <StartupGate>
                <p>the app</p>
            </StartupGate>,
        );
        const card = await screen.findByTestId('startup-error');
        expect(card).toHaveTextContent('No file exists at /k.');
        expect(card).toHaveTextContent('Fix or clear the kubeconfig path in Settings.');
        expect(screen.queryByText('the app')).not.toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
        expect(await screen.findByText('the app')).toBeInTheDocument();
    });

    it('lets the user pick a kubeconfig or reset to the default', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'startupChecks') return failing;
            if (channel === 'kubeconfig.pick') return { path: '/picked' };
            if (channel === 'kubeconfig.useDefault') return {};
            throw new Error(`unexpected ${channel}`);
        });
        renderWithQuery(
            <StartupGate>
                <p>the app</p>
            </StartupGate>,
        );
        await screen.findByTestId('startup-error');
        await userEvent.click(screen.getByRole('button', { name: 'Choose kubeconfig…' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('kubeconfig.pick', {}));
        await userEvent.click(screen.getByRole('button', { name: 'Use default kubeconfig' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('kubeconfig.useDefault', {}));
    });

    it('reports a bridge failure as a single error check', async () => {
        invoke.mockRejectedValueOnce(new Error('blocked IPC channel: startupChecks'));
        renderWithQuery(
            <StartupGate>
                <p>the app</p>
            </StartupGate>,
        );
        expect(await screen.findByTestId('startup-error')).toHaveTextContent('blocked IPC channel: startupChecks');
    });
});
