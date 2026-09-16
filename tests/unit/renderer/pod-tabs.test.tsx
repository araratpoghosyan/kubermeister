import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodDetail as PodDetailModel } from '../../../src/shared/k8s/pods';
import { renderInRouter, renderWithQuery } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({ ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')), invoke }));
const streams = { usePodLogStream: vi.fn(), openPodExec: vi.fn(), usePodPortForward: vi.fn() };
vi.mock('@/lib/pod-streams', async () => ({
    ...(await vi.importActual<typeof import('@/lib/pod-streams')>('@/lib/pod-streams')),
    ...streams,
}));
const download = vi.fn();
vi.mock('@/lib/download', () => ({ downloadTextFile: download }));

const terminal = {
    open: vi.fn(),
    write: vi.fn(),
    loadAddon: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    options: {} as { theme?: Record<string, string> },
};
let terminalOptions: Record<string, unknown> | undefined;
vi.mock('@xterm/xterm', () => ({
    Terminal: class {
        constructor(options: Record<string, unknown>) {
            terminalOptions = options;
            return terminal;
        }
    },
}));
vi.mock('@xterm/addon-fit', () => ({
    FitAddon: class {
        fit = vi.fn();
    },
}));
vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

const { filterLines, LogViewer, SINCE_OPTIONS } = await import('@/components/data-display/log-viewer');
const { LogsTab } = await import('@/components/pod/logs-tab');
const { ShellTab, DARK_ANSI, LIGHT_ANSI, readTerminalTheme } = await import('@/components/pod/shell-tab');
const { NetworkTab } = await import('@/components/pod/network-tab');
const { OverviewTab } = await import('@/components/pod/overview-tab');
const { declaredPorts, parseLocalPort, PortForwardControl } = await import('@/components/pod/port-forward-control');

const container = (
    name: string,
    ports: string[] = [],
    overrides: Partial<PodDetailModel['containers'][number]> = {},
) => ({
    name,
    image: `${name}:1.0`,
    imageId: 'sha256:abc',
    pullPolicy: 'Always',
    state: 'Running' as const,
    started: '2h ago',
    restarts: 0,
    cpuRequest: '100m',
    cpuLimit: '500m',
    memRequest: '64Mi',
    memLimit: '128Mi',
    ports,
    probes: [],
    ...overrides,
});
const pod: PodDetailModel = {
    name: 'web-1',
    namespace: 'team-a',
    status: 'Running',
    ready: '2/2',
    restarts: 0,
    age: '1d',
    node: 'n1',
    cpu: 0,
    mem: 0,
    cpuLimit: 0,
    memLimit: 0,
    podIP: '10.0.0.1',
    hostIP: '10.0.0.2',
    qos: 'Burstable',
    dnsPolicy: 'ClusterFirst',
    serviceAccount: 'default',
    conditions: [
        { type: 'Ready', ok: true, time: '1h ago' },
        { type: 'PodScheduled', ok: false, time: '—' },
    ],
    containers: [
        container('web', ['8080/TCP', '8443/TCP'], { probes: [{ kind: 'Readiness', spec: 'httpGet /:8080 · 10s' }] }),
        container('sidecar', ['8080/TCP'], { state: 'CrashLoop', restarts: 7 }),
    ],
    labels: [['app', 'web']],
    annotations: [],
};
const line = (message: string, level: 'INFO' | 'ERROR' = 'INFO') => ({
    level,
    timestamp: '2026-09-15T12:00:00Z',
    message,
});
const idle = { lines: [], live: false, error: null, ended: false };

beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    invoke.mockReset();
    download.mockReset();
    streams.usePodLogStream.mockReset();
    streams.usePodLogStream.mockReturnValue(idle);
    streams.openPodExec.mockReset();
    streams.usePodPortForward.mockReset();
    terminal.write.mockReset();
    terminal.dispose.mockReset();
    terminal.options = {};
    document.documentElement.classList.remove('light', 'dark');
});

describe('LogViewer', () => {
    const noop = () => {};
    const props = {
        containers: ['web', 'sidecar'],
        container: 'web',
        onContainerChange: noop,
        since: SINCE_OPTIONS[0]!,
        onSinceChange: noop,
        live: false,
        onLiveToggle: noop,
        grep: '',
        onGrepChange: noop,
        onDownload: noop,
    };

    it('filters case-insensitively on the message', () => {
        const lines = [line('GET /healthz'), line('boom', 'ERROR')];
        expect(filterLines(lines, '')).toHaveLength(2);
        expect(filterLines(lines, ' health ')).toHaveLength(1);
        expect(filterLines(lines, 'BOOM')[0]?.message).toBe('boom');
    });

    it('renders numbered lines with level colors and a snapshot footer', () => {
        renderWithQuery(<LogViewer {...props} lines={[line('boom', 'ERROR'), line('fine')]} filtered />);
        const list = screen.getByRole('list', { name: 'Log lines' });
        const rows = within(list).getAllByRole('listitem');
        expect(rows).toHaveLength(2);
        expect(rows[0]).toHaveTextContent('1');
        expect(within(rows[0]!).getByText('ERROR')).toHaveClass('text-danger');
        expect(within(rows[1]!).getByText('INFO')).toHaveClass('text-ok');
        expect(screen.getByTestId('log-status')).toHaveTextContent('snapshot · 2 lines (filtered)');
        expect(screen.getByTestId('log-viewer')).toHaveAttribute('data-live', 'false');
    });

    it('shows the live state, a stream error, and fires the toggles', async () => {
        const onLiveToggle = vi.fn();
        const onDownload = vi.fn();
        const onContainerChange = vi.fn();
        const onSinceChange = vi.fn();
        renderWithQuery(
            <LogViewer
                {...props}
                lines={[]}
                live
                error="forbidden"
                onLiveToggle={onLiveToggle}
                onDownload={onDownload}
                onContainerChange={onContainerChange}
                onSinceChange={onSinceChange}
            />,
        );
        expect(screen.getByTestId('log-viewer')).toHaveAttribute('data-live', 'true');
        expect(screen.getByRole('alert')).toHaveTextContent('forbidden');
        expect(screen.getByTestId('log-status')).toHaveTextContent('streaming · 0 lines');
        expect(screen.getByRole('button', { name: 'Live' })).toHaveAttribute('aria-pressed', 'true');
        await userEvent.click(screen.getByRole('button', { name: 'Live' }));
        expect(onLiveToggle).toHaveBeenCalledOnce();
        await userEvent.click(screen.getByRole('button', { name: 'Download logs' }));
        expect(onDownload).toHaveBeenCalledOnce();
        await userEvent.click(screen.getByRole('button', { name: 'Container' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'sidecar' }));
        expect(onContainerChange).toHaveBeenCalledWith('sidecar');
        await userEvent.click(screen.getByRole('button', { name: 'Since' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: '1 hour' }));
        expect(onSinceChange).toHaveBeenCalledWith({ label: '1 hour', seconds: 3600 });
    });
});

describe('LogsTab', () => {
    it('reads a snapshot of the first container, then follows it live when toggled', async () => {
        invoke.mockResolvedValue([line('from snapshot')]);
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        expect(await screen.findByText('from snapshot')).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith('pods.logSnapshot', {
            name: 'web-1',
            namespace: 'team-a',
            container: 'web',
            sinceSeconds: 300,
        });
        expect(streams.usePodLogStream).toHaveBeenLastCalledWith(null);

        streams.usePodLogStream.mockReturnValue({
            lines: [line('from stream')],
            live: true,
            error: null,
            ended: false,
        });
        await userEvent.click(screen.getByRole('button', { name: 'Live' }));
        expect(streams.usePodLogStream).toHaveBeenLastCalledWith({
            name: 'web-1',
            namespace: 'team-a',
            container: 'web',
            sinceSeconds: 300,
        });
        expect(screen.getByText('from stream')).toBeInTheDocument();
        expect(screen.queryByText('from snapshot')).not.toBeInTheDocument();
    });

    it('re-reads when the container or window changes and filters with grep', async () => {
        invoke.mockImplementation(async (_channel: string, input: { container: string; sinceSeconds?: number }) => [
            line(`${input.container} since ${input.sinceSeconds ?? 'all'}`),
            line('noise'),
        ]);
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        expect(await screen.findByText('web since 300')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Container' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'sidecar' }));
        expect(await screen.findByText('sidecar since 300')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Since' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'All logs' }));
        expect(await screen.findByText('sidecar since all')).toBeInTheDocument();
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter log lines' }), 'NOISE');
        await waitFor(() => expect(screen.getByTestId('log-status')).toHaveTextContent('1 lines (filtered)'));
        expect(screen.queryByText('sidecar since all')).not.toBeInTheDocument();
    });

    it('downloads the visible lines as a log file and surfaces a snapshot failure', async () => {
        invoke.mockResolvedValue([line('boom', 'ERROR')]);
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('boom');
        await userEvent.click(screen.getByRole('button', { name: 'Download logs' }));
        expect(download).toHaveBeenCalledWith('web-1.log', '2026-09-15T12:00:00Z ERROR boom');
    });

    it('does nothing until the pod resolves to a container', () => {
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={null} />);
        expect(invoke).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Container' })).toBeDisabled();
    });
});

describe('ShellTab', () => {
    it('opens one exec session into a themed terminal, follows theme flips, and closes on unmount', async () => {
        const session = { stop: vi.fn(), send: vi.fn() };
        streams.openPodExec.mockReturnValue(session);
        document.documentElement.classList.add('dark');
        const { unmount } = renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        expect(streams.openPodExec).toHaveBeenCalledTimes(1);
        expect(streams.openPodExec).toHaveBeenCalledWith(
            { name: 'web-1', namespace: 'team-a', container: 'web' },
            expect.any(Object),
        );
        expect(terminal.open).toHaveBeenCalledWith(screen.getByTestId('terminal-host'));
        expect(terminalOptions?.theme).toMatchObject({ black: DARK_ANSI.black, background: '#0b0e14' });
        expect(screen.getByText('/bin/sh')).toBeInTheDocument();

        document.documentElement.classList.replace('dark', 'light');
        await waitFor(() => expect(terminal.options.theme).toMatchObject({ black: LIGHT_ANSI.black }));

        const callbacks = streams.openPodExec.mock.calls[0]![1] as {
            onData: (s: string) => void;
            onError: (s: string) => void;
            onEnd: () => void;
        };
        callbacks.onData('$ ');
        callbacks.onError('lost');
        callbacks.onEnd();
        expect(terminal.write).toHaveBeenNthCalledWith(1, '$ ');
        expect(terminal.write.mock.calls[1]![0]).toContain('lost');
        expect(terminal.write.mock.calls[2]![0]).toContain('session ended');
        const onData = terminal.onData.mock.calls.at(-1)![0] as (data: string) => void;
        onData('ls\n');
        expect(session.send).toHaveBeenCalledWith('ls\n');
        unmount();
        expect(session.stop).toHaveBeenCalledOnce();
        expect(terminal.dispose).toHaveBeenCalledOnce();
    });

    it('reopens against the chosen container and waits while the pod is unknown', async () => {
        const session = { stop: vi.fn(), send: vi.fn() };
        streams.openPodExec.mockReturnValue(session);
        const { rerender } = renderWithQuery(<ShellTab name="web-1" namespace="team-a" pod={null} />);
        expect(streams.openPodExec).not.toHaveBeenCalled();
        expect(screen.queryByRole('button', { name: 'Container' })).not.toBeInTheDocument();
        rerender(<ShellTab name="web-1" namespace="team-a" pod={pod} />);
        expect(streams.openPodExec).toHaveBeenCalledTimes(1);
        await userEvent.click(screen.getByRole('button', { name: 'Container' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'sidecar' }));
        expect(session.stop).toHaveBeenCalledOnce();
        expect(streams.openPodExec).toHaveBeenLastCalledWith(
            expect.objectContaining({ container: 'sidecar' }),
            expect.any(Object),
        );
    });

    it('reads token colors with fallbacks and the palette for the root class', () => {
        const host = document.createElement('div');
        expect(readTerminalTheme(host)).toMatchObject({ background: '#0b0e14', ...DARK_ANSI });
        document.documentElement.classList.add('light');
        expect(readTerminalTheme(host)).toMatchObject(LIGHT_ANSI);
    });
});

describe('OverviewTab', () => {
    it('renders metric placeholders, conditions, and every container with facts and probes', () => {
        renderWithQuery(<OverviewTab name="web-1" namespace="team-a" pod={pod} />);
        expect(screen.getByText('CPU')).toBeInTheDocument();
        expect(screen.getAllByText('no metrics yet')).toHaveLength(2);
        const conditions = screen.getByTestId('conditions');
        expect(conditions.querySelector('[data-condition="Ready"]')).toHaveAttribute('data-ok', 'true');
        expect(conditions.querySelector('[data-condition="PodScheduled"]')).toHaveTextContent('—');
        const containers = screen.getByTestId('containers');
        expect(containers).toHaveTextContent('2');
        const web = containers.querySelector('[data-container="web"]') as HTMLElement;
        expect(web).toHaveTextContent('web:1.0');
        expect(web).toHaveTextContent('Readiness');
        expect(within(web).getByText('Running')).toHaveAttribute('data-tone', 'ok');
        expect(web).toHaveTextContent('Pull policy Always');
        const sidecar = containers.querySelector('[data-container="sidecar"]') as HTMLElement;
        expect(within(sidecar).getByText('CrashLoop')).toHaveAttribute('data-tone', 'danger');
        expect(sidecar).toHaveTextContent('No probes configured.');
        expect(sidecar).toHaveClass('border-t');
        // No owner chain has arrived, so there is no workload to roll and Restart stays inert.
        expect(screen.getByRole('button', { name: 'Restart' })).toHaveAttribute('aria-disabled', 'true');
    });

    it('shows the workload above the pod, linking the kinds it can show', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'pods.owners'
                ? [
                      { kind: 'ReplicaSet', name: 'web-abc', namespace: 'team-a', path: null },
                      {
                          kind: 'Deployment',
                          name: 'web',
                          namespace: 'team-a',
                          path: '/workloads/deployments/team-a/web',
                      },
                  ]
                : undefined,
        );
        renderInRouter(<OverviewTab name="web-1" namespace="team-a" pod={pod} />);
        const chain = await screen.findByTestId('owner-chain');
        expect(chain).toHaveTextContent('ReplicaSet');
        expect(chain).toHaveTextContent('web-abc');
        // The ReplicaSet has no screen, so it is named but not a link; the Deployment is.
        expect(within(chain).getAllByRole('link')).toHaveLength(1);
        expect(within(chain).getByRole('link', { name: 'web' })).toHaveAttribute(
            'href',
            expect.stringContaining('/workloads/deployments/team-a/web'),
        );
    });

    it('restarts the workload that owns the pod, since a pod alone cannot be restarted', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === 'pods.owners') {
                return [
                    { kind: 'ReplicaSet', name: 'web-abc', namespace: 'team-a', path: null },
                    { kind: 'Deployment', name: 'web', namespace: 'team-a', path: '/workloads/deployments/team-a/web' },
                ];
            }
            if (channel === 'context.current') return { name: 'alpha', cluster: 'a', user: 'u', current: true };
            if (channel === 'resources.restart') return { kind: 'Deployment', name: 'web', namespace: 'team-a' };
            return undefined;
        });
        renderInRouter(<OverviewTab name="web-1" namespace="team-a" pod={pod} />);
        // The inert button is replaced by the real one once the chain names a workload to roll.
        await waitFor(() =>
            expect(screen.getByRole('button', { name: 'Restart' })).not.toHaveAttribute('aria-disabled'),
        );
        await userEvent.click(screen.getByRole('button', { name: 'Restart' }));
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('resources.restart', {
                context: 'alpha',
                kind: 'Deployment',
                name: 'web',
                namespace: 'team-a',
            }),
        );
    });

    it('shows the latest sampled usage with sparklines once series arrive', async () => {
        invoke.mockImplementation(async (channel: string) =>
            channel === 'metrics.podSeries' ? { cpu: [100, 250], mem: [60, 96] } : undefined,
        );
        renderWithQuery(<OverviewTab name="web-1" namespace="team-a" pod={pod} />);
        expect(await screen.findByText('250m')).toBeInTheDocument();
        expect(screen.getByText('96Mi')).toBeInTheDocument();
        expect(screen.getAllByText('current usage')).toHaveLength(2);
        expect(screen.getByText('250m').closest('[data-slot="card"]')?.querySelector('svg')).not.toBeNull();
        expect(invoke).toHaveBeenCalledWith('metrics.podSeries', { namespace: 'team-a', name: 'web-1' });
    });

    it('renders empty states before the pod resolves', () => {
        renderWithQuery(<OverviewTab name="web-1" namespace="team-a" pod={null} />);
        expect(screen.getByText('No conditions reported.')).toBeInTheDocument();
        expect(screen.getByTestId('containers')).toHaveTextContent('0');
    });
});

describe('NetworkTab and PortForwardControl', () => {
    it('lists connectivity facts with dashes for unknowns', () => {
        streams.usePodPortForward.mockReturnValue({
            forwarding: false,
            status: null,
            error: null,
            start: vi.fn(),
            stop: vi.fn(),
        });
        const { rerender } = renderWithQuery(<NetworkTab name="web-1" namespace="team-a" pod={pod} />);
        const network = screen.getByTestId('network');
        expect(network).toHaveTextContent('Ports & connectivity');
        expect(network).toHaveTextContent('10.0.0.1');
        expect(network).toHaveTextContent('8080/TCP, 8443/TCP, 8080/TCP');
        rerender(<NetworkTab name="web-1" namespace="team-a" pod={null} />);
        expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(7);
    });

    it('derives distinct declared ports and validates the local port', () => {
        expect(declaredPorts(pod)).toEqual([8080, 8443]);
        expect(declaredPorts(null)).toEqual([]);
        expect(parseLocalPort('', 8080)).toBe(8080);
        expect(parseLocalPort(' 9090 ', 8080)).toBe(9090);
        expect(parseLocalPort('0', 8080)).toBeNull();
        expect(parseLocalPort('70000', 8080)).toBeNull();
        expect(parseLocalPort('abc', 8080)).toBeNull();
    });

    it('starts with a chosen target and typed local port, shows status, and stops', async () => {
        const forward = { forwarding: false, status: null, error: null, start: vi.fn(), stop: vi.fn() };
        streams.usePodPortForward.mockReturnValue(forward);
        const { rerender } = renderWithQuery(<PortForwardControl name="web-1" namespace="team-a" pod={pod} />);
        await userEvent.click(screen.getByRole('button', { name: 'Target port' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: '8443' }));
        await userEvent.type(screen.getByRole('textbox', { name: 'Local port' }), '9090');
        await userEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(forward.start).toHaveBeenCalledWith({
            name: 'web-1',
            namespace: 'team-a',
            targetPort: 8443,
            localPort: 9090,
        });

        streams.usePodPortForward.mockReturnValue({
            ...forward,
            forwarding: true,
            status: { status: 'listening', localPort: 9090, targetPort: 8443 },
        });
        rerender(<PortForwardControl name="web-1" namespace="team-a" pod={pod} />);
        expect(screen.getByTestId('port-forward-status')).toHaveTextContent('Listening on 127.0.0.1:9090 → 8443');
        expect(screen.getByRole('textbox', { name: 'Local port' })).toBeDisabled();
        await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
        expect(forward.stop).toHaveBeenCalledOnce();
    });

    it('rejects an invalid local port, shows stream errors, and handles pods without ports', async () => {
        const forward = { forwarding: false, status: null, error: null, start: vi.fn(), stop: vi.fn() };
        streams.usePodPortForward.mockReturnValue(forward);
        const { rerender } = renderWithQuery(<PortForwardControl name="web-1" namespace="team-a" pod={pod} />);
        await userEvent.type(screen.getByRole('textbox', { name: 'Local port' }), 'abc');
        await userEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(forward.start).not.toHaveBeenCalled();
        expect(screen.getByTestId('port-forward-status')).toHaveAttribute('data-error', 'true');
        expect(screen.getByTestId('port-forward-status')).toHaveTextContent(
            'error: enter a valid local port (1–65535)',
        );

        streams.usePodPortForward.mockReturnValue({ ...forward, error: 'address in use' });
        await userEvent.clear(screen.getByRole('textbox', { name: 'Local port' }));
        await userEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(forward.start).toHaveBeenCalledWith(expect.objectContaining({ localPort: 8080 }));
        rerender(<PortForwardControl name="web-1" namespace="team-a" pod={pod} />);
        expect(screen.getByTestId('port-forward-status')).toHaveTextContent('error: address in use');

        rerender(
            <PortForwardControl name="web-1" namespace="team-a" pod={{ ...pod, containers: [container('web')] }} />,
        );
        expect(screen.getByText('This pod declares no container ports.')).toBeInTheDocument();
    });
});
