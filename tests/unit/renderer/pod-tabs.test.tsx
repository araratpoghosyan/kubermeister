import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodDetail as PodDetailModel } from '../../../src/shared/k8s/pods';

const streams = { usePodLogStream: vi.fn(), openPodExec: vi.fn(), usePodPortForward: vi.fn() };
vi.mock('@/lib/pod-streams', async () => ({
    ...(await vi.importActual<typeof import('@/lib/pod-streams')>('@/lib/pod-streams')),
    ...streams,
}));

const terminal = {
    open: vi.fn(),
    write: vi.fn(),
    loadAddon: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
};
vi.mock('@xterm/xterm', () => ({
    Terminal: class {
        constructor() {
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

const { filterLines, LogViewer, SINCE_OPTIONS } = await import('@/components/workloads/log-viewer');
const { PodLogsTab } = await import('@/components/workloads/pod-logs-tab');
const { PodShellTab } = await import('@/components/workloads/pod-shell-tab');
const { declaredPorts, parseLocalPort, PortForwardControl } =
    await import('@/components/workloads/port-forward-control');

const container = (name: string, ports: string[] = []) => ({
    name,
    image: 'x',
    imageId: 'x',
    pullPolicy: 'Always',
    state: 'Running' as const,
    started: '—',
    restarts: 0,
    cpuRequest: '—',
    cpuLimit: '—',
    memRequest: '—',
    memLimit: '—',
    ports,
    probes: [],
});
const pod: PodDetailModel = {
    name: 'web-1',
    namespace: 'team-a',
    status: 'Running',
    ready: '2/2',
    restarts: 0,
    age: '1d',
    node: 'n1',
    cpuLimit: 0,
    memLimit: 0,
    podIP: '10.0.0.1',
    hostIP: '10.0.0.2',
    qos: 'Burstable',
    dnsPolicy: 'ClusterFirst',
    serviceAccount: 'default',
    conditions: [],
    containers: [container('web', ['8080/TCP', '8443/TCP']), container('sidecar', ['8080/TCP'])],
    labels: [],
    annotations: [],
};

beforeEach(() => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            disconnect() {}
        },
    );
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    Element.prototype.scrollIntoView = vi.fn();
    streams.usePodLogStream.mockReset();
    streams.openPodExec.mockReset();
    streams.usePodPortForward.mockReset();
    terminal.write.mockReset();
    terminal.dispose.mockReset();
});

describe('log viewer', () => {
    it('filters case-insensitively on the message', () => {
        const lines = [
            { level: 'INFO' as const, timestamp: 't', message: 'GET /healthz' },
            { level: 'ERROR' as const, timestamp: 't', message: 'boom' },
        ];
        expect(filterLines(lines, '')).toHaveLength(2);
        expect(filterLines(lines, ' health ')).toHaveLength(1);
        expect(filterLines(lines, 'BOOM')[0]?.message).toBe('boom');
    });

    it('renders lines with level colors and the status line, and filters as the user types', async () => {
        const state = {
            lines: [
                { level: 'ERROR' as const, timestamp: '2026-09-15T12:00:00Z', message: 'boom' },
                { level: 'INFO' as const, timestamp: '', message: 'fine' },
            ],
            live: true,
            error: null,
            ended: false,
        };
        render(
            <LogViewer
                state={state}
                containers={['web']}
                container="web"
                onContainerChange={() => {}}
                since={SINCE_OPTIONS[0]}
                onSinceChange={() => {}}
            />,
        );
        expect(screen.getByTestId('log-status')).toHaveTextContent('Live · 2 lines');
        const list = screen.getByRole('list', { name: 'Log lines' });
        expect(within(list).getAllByRole('listitem')).toHaveLength(2);
        expect(within(list).getByText('boom').closest('li')).toHaveClass('text-red-500');
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter log lines' }), 'fine');
        expect(within(list).getAllByRole('listitem')).toHaveLength(1);
        expect(screen.getByTestId('log-status')).toHaveTextContent('1 line');
    });

    it('shows errors and the ended state', () => {
        const { rerender } = render(
            <LogViewer
                state={{ lines: [], live: false, error: 'forbidden', ended: false }}
                containers={['web']}
                container="web"
                onContainerChange={() => {}}
                since={SINCE_OPTIONS[0]}
                onSinceChange={() => {}}
            />,
        );
        expect(screen.getByTestId('log-status')).toHaveTextContent('Error: forbidden');
        rerender(
            <LogViewer
                state={{ lines: [], live: false, error: null, ended: true }}
                containers={['web']}
                container="web"
                onContainerChange={() => {}}
                since={SINCE_OPTIONS[0]}
                onSinceChange={() => {}}
            />,
        );
        expect(screen.getByTestId('log-status')).toHaveTextContent('Stream ended');
    });

    it('the logs tab follows the first container of the pod by default', () => {
        streams.usePodLogStream.mockReturnValue({ lines: [], live: false, error: null, ended: false });
        render(<PodLogsTab pod={pod} />);
        expect(streams.usePodLogStream).toHaveBeenCalledWith({
            name: 'web-1',
            namespace: 'team-a',
            container: 'web',
            sinceSeconds: undefined,
        });
        render(<PodLogsTab pod={{ ...pod, containers: [] }} />);
        expect(screen.getByText('This pod has no containers.')).toBeInTheDocument();
    });
});

describe('shell tab', () => {
    it('opens exactly one exec session into a terminal and closes it on unmount', () => {
        const session = { stop: vi.fn(), send: vi.fn() };
        streams.openPodExec.mockReturnValue(session);
        const { unmount } = render(<PodShellTab pod={pod} />);
        expect(streams.openPodExec).toHaveBeenCalledTimes(1);
        expect(streams.openPodExec).toHaveBeenCalledWith(
            { name: 'web-1', namespace: 'team-a', container: 'web' },
            expect.any(Object),
        );
        expect(terminal.open).toHaveBeenCalledWith(screen.getByTestId('terminal-host'));
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
        const onData = terminal.onData.mock.calls[0]![0] as (data: string) => void;
        onData('ls\n');
        expect(session.send).toHaveBeenCalledWith('ls\n');
        unmount();
        expect(session.stop).toHaveBeenCalledOnce();
        expect(terminal.dispose).toHaveBeenCalledOnce();
    });
});

describe('port-forward control', () => {
    it('derives distinct declared ports and validates the local port', () => {
        expect(declaredPorts(pod)).toEqual([8080, 8443]);
        expect(parseLocalPort('', 8080)).toBe(8080);
        expect(parseLocalPort(' 9090 ', 8080)).toBe(9090);
        expect(parseLocalPort('0', 8080)).toBeNull();
        expect(parseLocalPort('70000', 8080)).toBeNull();
        expect(parseLocalPort('abc', 8080)).toBeNull();
    });

    it('starts with the first target and the typed local port, shows status, and stops', async () => {
        const forward = { forwarding: false, status: null, error: null, start: vi.fn(), stop: vi.fn() };
        streams.usePodPortForward.mockReturnValue(forward);
        const { rerender } = render(<PortForwardControl pod={pod} />);
        await userEvent.type(screen.getByRole('textbox', { name: 'Local port' }), '9090');
        await userEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(forward.start).toHaveBeenCalledWith({
            name: 'web-1',
            namespace: 'team-a',
            targetPort: 8080,
            localPort: 9090,
        });

        streams.usePodPortForward.mockReturnValue({
            ...forward,
            forwarding: true,
            status: { status: 'listening', localPort: 9090, targetPort: 8080 },
        });
        rerender(<PortForwardControl pod={pod} />);
        expect(screen.getByTestId('port-forward-status')).toHaveTextContent('Listening on 127.0.0.1:9090 → 8080');
        await userEvent.click(screen.getByRole('button', { name: 'Stop' }));
        expect(forward.stop).toHaveBeenCalledOnce();
    });

    it('rejects an invalid local port before starting and handles pods without ports', async () => {
        const forward = { forwarding: false, status: null, error: null, start: vi.fn(), stop: vi.fn() };
        streams.usePodPortForward.mockReturnValue(forward);
        render(<PortForwardControl pod={pod} />);
        await userEvent.type(screen.getByRole('textbox', { name: 'Local port' }), 'abc');
        await userEvent.click(screen.getByRole('button', { name: 'Start' }));
        expect(forward.start).not.toHaveBeenCalled();
        expect(screen.getByTestId('port-forward-status')).toHaveAttribute('data-error', 'true');
        render(<PortForwardControl pod={{ ...pod, containers: [container('web')] }} />);
        expect(screen.getByText('This pod declares no container ports.')).toBeInTheDocument();
    });
});
