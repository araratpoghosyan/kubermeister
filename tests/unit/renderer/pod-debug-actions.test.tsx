import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke,
}));

const toasts = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', async () => ({
    ...(await vi.importActual<typeof import('sonner')>('sonner')),
    toast: toasts,
}));

const navigateTo = vi.fn();
vi.mock('@/components/layout/nav-link', async () => ({
    ...(await vi.importActual<typeof import('@/components/layout/nav-link')>('@/components/layout/nav-link')),
    useNavigateTo: () => navigateTo,
}));

const { CopyFilesCard, DebugContainerButton } = await import('@/components/pod/debug-actions');
const { NodeShellButton } = await import('@/components/node/node-shell-button');

const SETTINGS = {
    version: 1,
    session: { lastContext: null, lastNamespace: null, restoreOnLaunch: true },
    connection: { kubeconfigPath: null },
    data: { refreshIntervalSec: 12, logBufferLines: 2000, terminalFontSize: 12, forwards: [] },
    updates: { mode: 'check' },
    window: { bounds: null },
};

const answers = (extra: Record<string, unknown> = {}) => {
    invoke.mockImplementation(async (channel: string) => {
        const base: Record<string, unknown> = {
            'settings.get': SETTINGS,
            'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
            'namespace.active': { name: 'team-a', pods: 3, tone: 'accent' },
            ...extra,
        };
        return base[channel] ?? null;
    });
};

beforeEach(() => {
    invoke.mockReset();
    navigateTo.mockReset();
    toasts.success.mockReset();
    answers();
});

describe('attaching a debug container', () => {
    it('warns that it cannot be removed, then hands the container back to the shell beside it', async () => {
        answers({ 'pods.debug': { pod: 'web-1', namespace: 'team-a', container: 'debugger-1' } });
        const attached = vi.fn();
        renderWithQuery(<DebugContainerButton name="web-1" namespace="team-a" container="web" onAttached={attached} />);

        await userEvent.click(screen.getByRole('button', { name: 'Debug' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('cannot remove an ephemeral container');
        await userEvent.type(within(dialog).getByLabelText('Image'), 'alpine:3.20');
        await userEvent.click(within(dialog).getByRole('button', { name: 'Attach' }));

        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('pods.debug', {
                context: 'alpha',
                name: 'web-1',
                namespace: 'team-a',
                targetContainer: 'web',
                image: 'alpine:3.20',
            }),
        );
        // The shell in the tab switches into it; there is nowhere else for a session to go.
        await waitFor(() => expect(attached).toHaveBeenCalledWith('debugger-1'));
        expect(toasts.success).toHaveBeenCalledWith('Debug container “debugger-1” attached', expect.anything());
    });

    it('leaves the pod alone when the dialog is dismissed', async () => {
        renderWithQuery(<DebugContainerButton name="web-1" namespace="team-a" container="web" />);
        await userEvent.click(screen.getByRole('button', { name: 'Debug' }));
        await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(invoke).not.toHaveBeenCalledWith('pods.debug', expect.anything());
    });
});

describe('copying files in and out', () => {
    it('asks the cluster only when a path is given, and copies each way', async () => {
        answers({
            'pods.copyFrom': { localPath: '/tmp/out.tar', remotePath: '/etc/nginx.conf' },
            'pods.copyTo': { localPath: '/home/me/notes.txt', remotePath: '/data/notes.txt' },
        });
        renderWithQuery(<CopyFilesCard name="web-1" namespace="team-a" container="web" />);
        const card = await screen.findByTestId('copy-files');
        expect(within(card).getByRole('button', { name: 'Copy out' })).toBeDisabled();

        await userEvent.type(within(card).getByLabelText('Path in the container'), '/etc/nginx.conf');
        await userEvent.click(within(card).getByRole('button', { name: 'Copy out' }));
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('pods.copyFrom', {
                context: 'alpha',
                name: 'web-1',
                namespace: 'team-a',
                container: 'web',
                remotePath: '/etc/nginx.conf',
            }),
        );
        await userEvent.click(within(card).getByRole('button', { name: 'Copy in' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('pods.copyTo', expect.anything()));
    });

    it('claims nothing when the file picker was called off', async () => {
        renderWithQuery(<CopyFilesCard name="web-1" namespace="team-a" container="web" />);
        const card = await screen.findByTestId('copy-files');
        await userEvent.type(within(card).getByLabelText('Path in the container'), '/etc/nginx.conf');
        await userEvent.click(within(card).getByRole('button', { name: 'Copy out' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('pods.copyFrom', expect.anything()));
        expect(toasts.success).not.toHaveBeenCalled();
    });
});

describe('a shell on a node', () => {
    it('spells out what it runs and refuses without a namespace to put it in', async () => {
        answers({ 'namespace.active': { name: null, pods: 0, tone: 'accent' } });
        renderWithQuery(<NodeShellButton name="node-1" />);
        await userEvent.click(await screen.findByRole('button', { name: 'Node shell' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('root on the machine');
        await waitFor(() => expect(dialog).toHaveTextContent('Select a namespace first'));
        expect(within(dialog).getByRole('button', { name: 'Open shell' })).toBeDisabled();
    });

    it('creates the pod and goes to it, since that is where its shell is', async () => {
        answers({
            'nodes.debug': { pod: 'kubermeister-node-shell-node-1-x', namespace: 'team-a', container: 'shell' },
        });
        renderWithQuery(<NodeShellButton name="node-1" />);
        await userEvent.click(await screen.findByRole('button', { name: 'Node shell' }));
        const dialog = await screen.findByRole('alertdialog');
        await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Open shell' })).toBeEnabled());
        await userEvent.click(within(dialog).getByRole('button', { name: 'Open shell' }));

        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('nodes.debug', {
                context: 'alpha',
                name: 'node-1',
                namespace: 'team-a',
            }),
        );
        await waitFor(() =>
            expect(navigateTo).toHaveBeenCalledWith('/workloads/pods/team-a/kubermeister-node-shell-node-1-x'),
        );
        // The pod it leaves behind is named, since deleting it is the user's job.
        expect(toasts.success).toHaveBeenCalledWith(
            'Node shell running as “kubermeister-node-shell-node-1-x”',
            expect.anything(),
        );
    });

    it('leaves the node alone when the dialog is dismissed', async () => {
        renderWithQuery(<NodeShellButton name="node-1" />);
        await userEvent.click(await screen.findByRole('button', { name: 'Node shell' }));
        await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(invoke).not.toHaveBeenCalledWith('nodes.debug', expect.anything());
    });
});
