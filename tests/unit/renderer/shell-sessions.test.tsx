import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

const exec = { stop: vi.fn(), send: vi.fn() };
const streams = { openPodExec: vi.fn(() => exec) };
vi.mock('@/lib/pod-streams', async () => ({
    ...(await vi.importActual<typeof import('@/lib/pod-streams')>('@/lib/pod-streams')),
    ...streams,
}));

/** One fake terminal per session, so a test can see what each was created with. */
const terminals: { options: Record<string, unknown>; write: ReturnType<typeof vi.fn> }[] = [];
vi.mock('@xterm/xterm', () => ({
    Terminal: class {
        options: Record<string, unknown>;
        write = vi.fn();
        loadAddon = vi.fn();
        open = vi.fn();
        dispose = vi.fn();
        constructor(options: Record<string, unknown>) {
            this.options = options;
            terminals.push({ options, write: this.write });
        }
        onData() {
            return { dispose: vi.fn() };
        }
    },
}));
vi.mock('@xterm/addon-fit', () => ({
    FitAddon: class {
        fit = vi.fn();
    },
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const { ShellDrawer } = await import('@/components/shell/shell-drawer');
const { ShellTab } = await import('@/components/pod/shell-tab');
const { NodeShellButton } = await import('@/components/node/node-shell-button');
const { closeAllShells, openShell, shellSnapshot } = await import('@/lib/shell-sessions');
const { DARK_ANSI, LIGHT_ANSI, readTerminalLook, readTerminalTheme } = await import('@/lib/terminal-look');

const SETTINGS = {
    version: 1,
    session: { lastContext: null, lastNamespace: null, restoreOnLaunch: true },
    connection: { kubeconfigPath: null },
    data: { refreshIntervalSec: 12, logBufferLines: 2000, terminalFontSize: 12 },
    updates: { mode: 'check' },
    window: { bounds: null },
};
const pod = {
    name: 'web-1',
    namespace: 'team-a',
    containers: [{ name: 'web' }, { name: 'sidecar' }],
} as never;
const look = { fontFamily: 'mono', fontSize: 12, theme: {} };

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(SETTINGS);
    exec.stop.mockReset();
    exec.send.mockReset();
    streams.openPodExec.mockClear();
    terminals.length = 0;
    toasts.success.mockReset();
});

afterEach(() => closeAllShells());

describe('shell sessions', () => {
    it('opens one session per container and hands back the same one if asked again', () => {
        const first = openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        const again = openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        expect(again).toBe(first);
        expect(streams.openPodExec).toHaveBeenCalledTimes(1);

        openShell({ namespace: 'team-a', pod: 'web-1', container: 'sidecar' }, look);
        expect(shellSnapshot()).toHaveLength(2);
    });

    it('remembers the lines typed into it, without the editing keystrokes', () => {
        const session = openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        session.send('ls -la\n');
        session.send('who');
        session.send('\x7f');
        session.send('\n');
        expect(session.history).toEqual(['ls -la', 'wh']);
        expect(exec.send).toHaveBeenCalledWith('ls -la\n');
    });

    it('ends every session when the cluster changes under it', () => {
        openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        openShell({ namespace: 'team-a', pod: 'web-2', container: 'web' }, look);
        closeAllShells();
        expect(shellSnapshot()).toEqual([]);
        expect(exec.stop).toHaveBeenCalledTimes(2);
    });
});

describe('how a terminal looks', () => {
    afterEach(() => document.documentElement.classList.remove('light', 'dark'));

    it('reads the app tokens, with fallbacks for a theme that has not loaded', () => {
        const theme = readTerminalTheme(document.documentElement);
        expect(theme.background).toBe('#0b0e14');
        expect(theme.foreground).toBe('#c9d1d9');
        expect(theme.cursor).toBe('#4d7cff');
    });

    it('ships the palette that suits the background', () => {
        expect(readTerminalTheme(document.documentElement).red).toBe(DARK_ANSI.red);
        document.documentElement.classList.add('light');
        expect(readTerminalTheme(document.documentElement).red).toBe(LIGHT_ANSI.red);
    });

    it('carries the font and the size a terminal is created with', () => {
        const look = readTerminalLook(document.documentElement, 16);
        expect(look.fontSize).toBe(16);
        expect(look.fontFamily).toBe('monospace');
        expect(look.theme.red).toBe(DARK_ANSI.red);
    });
});

describe('restyling open shells', () => {
    it('applies a new size and theme to every session at once', async () => {
        const { applyTerminalLook } = await import('@/lib/shell-sessions');
        openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        openShell({ namespace: 'team-a', pod: 'web-2', container: 'web' }, look);
        applyTerminalLook({ fontSize: 16 });
        expect(terminals.map((t) => t.options.fontSize)).toEqual([16, 16]);
        applyTerminalLook({ theme: LIGHT_ANSI as unknown as Record<string, string> });
        expect(terminals[0]!.options.theme).toBe(LIGHT_ANSI);
    });
});

describe('the shell drawer', () => {
    it('stays out of the way until something is open', () => {
        renderWithQuery(<ShellDrawer />);
        expect(screen.queryByTestId('shell-drawer')).not.toBeInTheDocument();
    });

    it('shows a tab per session, the newest in front, and closes one on request', async () => {
        renderWithQuery(<ShellDrawer />);
        openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        openShell({ namespace: 'team-a', pod: 'web-2', container: 'web' }, look);
        const drawer = await screen.findByTestId('shell-drawer');
        const tabs = within(drawer).getAllByRole('tab');
        expect(tabs.map((tab) => tab.textContent)).toEqual(['web-1web', 'web-2web']);
        expect(tabs[1]).toHaveAttribute('aria-selected', 'true');

        await userEvent.click(within(drawer).getByRole('tab', { name: /web-1/ }));
        expect(within(drawer).getByRole('tab', { name: /web-1/ })).toHaveAttribute('aria-selected', 'true');

        await userEvent.click(within(drawer).getByRole('button', { name: 'Close shell web-1' }));
        await waitFor(() => expect(within(drawer).getAllByRole('tab')).toHaveLength(1));
        expect(exec.stop).toHaveBeenCalledTimes(1);
    });

    it('keeps the session alive while the drawer is collapsed', async () => {
        renderWithQuery(<ShellDrawer />);
        openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        const drawer = await screen.findByTestId('shell-drawer');
        await userEvent.click(within(drawer).getByRole('button', { name: 'Collapse shells' }));
        expect(within(drawer).queryByTestId('shell-host')).not.toBeInTheDocument();
        // Collapsing hides the terminal; it does not end the session.
        expect(exec.stop).not.toHaveBeenCalled();
        expect(shellSnapshot()).toHaveLength(1);
    });

    it('sends a remembered command again from the history menu', async () => {
        renderWithQuery(<ShellDrawer />);
        const session = openShell({ namespace: 'team-a', pod: 'web-1', container: 'web' }, look);
        session.send('uptime\n');
        const drawer = await screen.findByTestId('shell-drawer');
        await userEvent.click(within(drawer).getByRole('button', { name: 'Command history' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'uptime' }));
        expect(exec.send).toHaveBeenLastCalledWith('uptime\n');
    });
});

describe('the pod shell tab', () => {
    it('opens a session in the drawer rather than a terminal of its own', async () => {
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        await waitFor(() => expect(streams.openPodExec).toHaveBeenCalledTimes(1));
        expect(streams.openPodExec).toHaveBeenCalledWith(
            { name: 'web-1', namespace: 'team-a', container: 'web' },
            expect.any(Object),
        );
        expect(await screen.findByText('Shell open below')).toBeInTheDocument();
    });

    it('does not reopen a shell that was closed under it, which is what a context switch does', async () => {
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        await waitFor(() => expect(streams.openPodExec).toHaveBeenCalledTimes(1));
        closeAllShells();
        await waitFor(() => expect(screen.getByTestId('shell-tab')).toHaveTextContent('Shell open below'));
        // One open, one close, and nothing sneaking a terminal back into the old cluster.
        expect(streams.openPodExec).toHaveBeenCalledTimes(1);
        expect(shellSnapshot()).toEqual([]);
    });

    it('focuses the shell it already opened instead of starting a second one', async () => {
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        await waitFor(() => expect(streams.openPodExec).toHaveBeenCalledTimes(1));
        await userEvent.click(await screen.findByRole('button', { name: /Focus shell/ }));
        expect(streams.openPodExec).toHaveBeenCalledTimes(1);
        expect(shellSnapshot()).toHaveLength(1);
    });

    it('waits for a container before opening anything', () => {
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={null} />);
        expect(streams.openPodExec).not.toHaveBeenCalled();
        expect(screen.getByText('No container to open a shell into')).toBeInTheDocument();
    });
});

describe('debugging a pod', () => {
    beforeEach(() => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'settings.get') return SETTINGS;
            if (channel === 'context.current') return { name: 'alpha', cluster: 'a', user: 'u', current: true };
            if (channel === 'pods.debug') return { pod: 'web-1', namespace: 'team-a', container: 'debugger-1' };
            if (channel === 'pods.copyFrom') return { localPath: '/tmp/out.tar', remotePath: '/etc/nginx.conf' };
            if (channel === 'pods.copyTo') return { localPath: '/home/me/notes.txt', remotePath: '/data/notes.txt' };
            return null;
        });
    });

    it('warns that a debug container cannot be removed, then opens its shell', async () => {
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        await waitFor(() => expect(streams.openPodExec).toHaveBeenCalledTimes(1));
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
        // The debugger's own shell opens in the drawer beside the pod's.
        await waitFor(() => expect(shellSnapshot().map((s) => s.container)).toContain('debugger-1'));
    });

    it('copies a file each way, and asks the cluster only when a path is given', async () => {
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
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
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'settings.get') return SETTINGS;
            if (channel === 'context.current') return { name: 'alpha', cluster: 'a', user: 'u', current: true };
            return null;
        });
        renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        const card = await screen.findByTestId('copy-files');
        await userEvent.type(within(card).getByLabelText('Path in the container'), '/etc/nginx.conf');
        await userEvent.click(within(card).getByRole('button', { name: 'Copy out' }));
        await waitFor(() => expect(invoke).toHaveBeenCalledWith('pods.copyFrom', expect.anything()));
        expect(toasts.success).not.toHaveBeenCalled();
    });
});

describe('calling off a debug action', () => {
    it('leaves the pod alone when either dialog is dismissed', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'settings.get') return SETTINGS;
            if (channel === 'context.current') return { name: 'alpha', cluster: 'a', user: 'u', current: true };
            if (channel === 'namespace.active') return { name: 'team-a', pods: 1, tone: 'accent' };
            return null;
        });
        const { unmount } = renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        await userEvent.click(await screen.findByRole('button', { name: 'Debug' }));
        await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(invoke).not.toHaveBeenCalledWith('pods.debug', expect.anything());
        unmount();

        renderWithQuery(<NodeShellButton name="node-1" />);
        await userEvent.click(await screen.findByRole('button', { name: 'Node shell' }));
        await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancel' }));
        await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
        expect(invoke).not.toHaveBeenCalledWith('nodes.debug', expect.anything());
    });
});

describe('a shell on a node', () => {
    it('spells out what it runs and refuses without a namespace to put it in', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'settings.get') return SETTINGS;
            if (channel === 'context.current') return { name: 'alpha', cluster: 'a', user: 'u', current: true };
            if (channel === 'namespace.active') return { name: null, pods: 0, tone: 'accent' };
            return null;
        });
        renderWithQuery(<NodeShellButton name="node-1" />);
        await userEvent.click(await screen.findByRole('button', { name: 'Node shell' }));
        const dialog = await screen.findByRole('alertdialog');
        expect(dialog).toHaveTextContent('root on the machine');
        await waitFor(() => expect(dialog).toHaveTextContent('Select a namespace first'));
        expect(within(dialog).getByRole('button', { name: 'Open shell' })).toBeDisabled();
    });

    it('creates the pod and opens a shell into it', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'settings.get') return SETTINGS;
            if (channel === 'context.current') return { name: 'alpha', cluster: 'a', user: 'u', current: true };
            if (channel === 'namespace.active') return { name: 'team-a', pods: 3, tone: 'accent' };
            if (channel === 'nodes.debug')
                return { pod: 'kubermeister-node-shell-node-1-x', namespace: 'team-a', container: 'shell' };
            return null;
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
        await waitFor(() => expect(shellSnapshot().map((s) => s.pod)).toContain('kubermeister-node-shell-node-1-x'));
        // The pod it leaves behind is named, since deleting it is the user's job.
        expect(toasts.success).toHaveBeenCalledWith(
            'Node shell running as “kubermeister-node-shell-node-1-x”',
            expect.anything(),
        );
    });
});
