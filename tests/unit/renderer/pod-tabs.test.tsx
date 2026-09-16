import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PodDetail as PodDetailModel } from '../../../src/shared/k8s/pods';
import { NO_SEARCH } from '@/lib/log-filter';
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

const toasts = { success: vi.fn(), error: vi.fn() };
vi.mock('sonner', async () => ({
    ...(await vi.importActual<typeof import('sonner')>('sonner')),
    toast: toasts,
}));

const { LogViewer, SINCE_OPTIONS } = await import('@/components/data-display/log-viewer');
const { LogsTab } = await import('@/components/pod/logs-tab');
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
    role: 'app',
    cpuUsed: null,
    memUsed: null,
    cpuRequested: null,
    memRequested: null,
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
/** The tab reads settings for its buffer size, so every mock answers that channel too. */
const SETTINGS = {
    version: 1,
    session: { lastContext: null, lastNamespace: null, restoreOnLaunch: true },
    connection: { kubeconfigPath: null },
    data: { refreshIntervalSec: 12, logBufferLines: 2000 },
    updates: { mode: 'check' },
    window: { bounds: null },
};
/** Answer the log channels with `lines`, and every other channel with what it expects. */
const answering =
    (lines: unknown, extra: Record<string, unknown> = {}) =>
    async (channel: string) => {
        if (channel === 'settings.get') return SETTINGS;
        if (channel in extra) return extra[channel];
        return lines;
    };

beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', () => 1);
    vi.stubGlobal('cancelAnimationFrame', () => {});
    invoke.mockReset();
    toasts.success.mockReset();
    download.mockReset();
    streams.usePodLogStream.mockReset();
    streams.usePodLogStream.mockReturnValue(idle);
    streams.usePodPortForward.mockReset();
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
        search: NO_SEARCH,
        onSearchChange: noop,
        minLevel: null,
        onMinLevelChange: noop,
        tailLines: 500,
        onTailLinesChange: noop,
        timestamps: true,
        onTimestampsToggle: noop,
        wrap: false,
        onWrapToggle: noop,
        previous: false,
        onPreviousToggle: noop,
        onDownload: noop,
    };
    /** The viewer renders what the caller already filtered, each line marked or not. */
    const shown = (...items: ReturnType<typeof line>[]) => items.map((one) => ({ line: one, match: false }));

    it('renders numbered lines with level colors and a snapshot footer', () => {
        renderWithQuery(<LogViewer {...props} lines={shown(line('boom', 'ERROR'), line('fine'))} filtered />);
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
        invoke.mockImplementation(answering([line('from snapshot')]));
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        expect(await screen.findByText('from snapshot')).toBeInTheDocument();
        expect(invoke).toHaveBeenCalledWith('pods.logSnapshot', {
            name: 'web-1',
            namespace: 'team-a',
            container: 'web',
            sinceSeconds: 300,
            tailLines: 500,
            previous: undefined,
        });
        expect(streams.usePodLogStream).toHaveBeenLastCalledWith(null, 2000);

        streams.usePodLogStream.mockReturnValue({
            lines: [line('from stream')],
            live: true,
            error: null,
            ended: false,
        });
        await userEvent.click(screen.getByRole('button', { name: 'Live' }));
        expect(streams.usePodLogStream).toHaveBeenLastCalledWith(
            {
                name: 'web-1',
                namespace: 'team-a',
                container: 'web',
                sinceSeconds: 300,
                tailLines: 500,
                previous: undefined,
            },
            // The buffer size comes from settings, so a live follow keeps what the user asked for.
            2000,
        );
        expect(screen.getByText('from stream')).toBeInTheDocument();
        expect(screen.queryByText('from snapshot')).not.toBeInTheDocument();
    });

    it('re-reads when the container or window changes and filters on the search', async () => {
        invoke.mockImplementation(async (channel: string, input: { container: string; sinceSeconds?: number }) =>
            channel === 'settings.get'
                ? SETTINGS
                : [line(`${input.container} since ${input.sinceSeconds ?? 'all'}`), line('noise')],
        );
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

    it('downloads the whole log from the cluster rather than the buffer on screen', async () => {
        invoke.mockImplementation(
            answering([line('boom', 'ERROR')], { 'pods.logDownload': { text: 'every line ever\n', truncated: false } }),
        );
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('boom');
        await userEvent.click(screen.getByRole('button', { name: 'Download logs' }));
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('pods.logDownload', {
                name: 'web-1',
                namespace: 'team-a',
                container: 'web',
                sinceSeconds: 300,
                previous: undefined,
            }),
        );
        expect(download).toHaveBeenCalledWith('web-1-web.log', 'every line ever\n');
    });

    it('keeps only as many lines as the buffer setting allows, without restarting the follow', async () => {
        const { appendCapped } = await vi.importActual<typeof import('@/lib/pod-streams')>('@/lib/pod-streams');
        // The trimming itself: the newest lines survive, the oldest fall off the front.
        expect(appendCapped([line('one'), line('two')], [line('three')], 2).map((l) => l.message)).toEqual([
            'two',
            'three',
        ]);
        expect(appendCapped([line('one')], [line('two')], 5)).toHaveLength(2);
    });

    it('does nothing until the pod resolves to a container', () => {
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={null} />);
        expect(invoke).not.toHaveBeenCalledWith('pods.logSnapshot', expect.anything());
        expect(screen.getByRole('button', { name: 'Container' })).toBeDisabled();
    });

    it('narrows by level, marks matches without hiding, and follows the previous run', async () => {
        invoke.mockImplementation(
            answering([line('all good'), line('boom', 'ERROR')], {
                'pods.logDownload': { text: '', truncated: false },
            }),
        );
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('all good');

        // A level floor hides everything below it.
        await userEvent.click(screen.getByRole('button', { name: 'Level' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'ERROR' }));
        await waitFor(() => expect(screen.queryByText('all good')).not.toBeInTheDocument());
        await userEvent.click(screen.getByRole('button', { name: 'Level' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: 'All levels' }));
        await screen.findByText('all good');

        // Highlight-only keeps every line and marks the ones that matched.
        await userEvent.click(screen.getByRole('button', { name: 'Mark' }));
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter log lines' }), 'boom');
        await waitFor(() =>
            expect(screen.getByRole('list', { name: 'Log lines' }).querySelectorAll('[data-match]')).toHaveLength(1),
        );
        expect(screen.getByText('all good')).toBeInTheDocument();

        // Reading the previous run asks the cluster for it.
        await userEvent.click(screen.getByRole('button', { name: 'Previous' }));
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('pods.logSnapshot', expect.objectContaining({ previous: true })),
        );
    });

    it('matches case only when asked, and says when a download was cut short', async () => {
        invoke.mockImplementation(
            answering([line('Boom'), line('boom')], { 'pods.logDownload': { text: 'tail only\n', truncated: true } }),
        );
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('Boom');
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter log lines' }), 'boom');
        await waitFor(() => expect(screen.getByTestId('log-status')).toHaveTextContent('2 lines'));
        await userEvent.click(screen.getByRole('button', { name: 'Aa' }));
        await waitFor(() => expect(screen.getByTestId('log-status')).toHaveTextContent('1 lines (filtered)'));

        await userEvent.click(screen.getByRole('button', { name: 'Download logs' }));
        await waitFor(() =>
            expect(toasts.success).toHaveBeenCalledWith('Log downloaded', {
                description: 'It was long, so the oldest lines were left behind.',
            }),
        );
    });

    it('says a pattern is not valid yet rather than emptying the console', async () => {
        invoke.mockImplementation(answering([line('connection refused', 'ERROR')]));
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('connection refused');
        await userEvent.click(screen.getByRole('button', { name: '.*' }));
        await userEvent.type(screen.getByRole('textbox', { name: 'Filter log lines' }), 'refused(');
        await waitFor(() => expect(screen.getByTestId('log-options')).toHaveTextContent('Not a valid pattern yet'));
        // The line is still there: an unfinished pattern filters nothing.
        expect(screen.getByText('connection refused')).toBeInTheDocument();
    });

    it('hides timestamps and wraps long lines on request', async () => {
        invoke.mockImplementation(answering([line('a very long line')]));
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('a very long line');
        expect(screen.getByText('2026-09-15T12:00:00Z')).toBeInTheDocument();
        await userEvent.click(screen.getByRole('button', { name: 'Timestamps' }));
        await waitFor(() => expect(screen.queryByText('2026-09-15T12:00:00Z')).not.toBeInTheDocument());

        const row = () => screen.getByRole('list', { name: 'Log lines' }).querySelector('[role="listitem"]');
        expect(row()).toHaveClass('whitespace-nowrap');
        await userEvent.click(screen.getByRole('button', { name: 'Wrap' }));
        await waitFor(() => expect(row()).toHaveClass('whitespace-pre-wrap'));
    });

    it('reads a shorter tail when asked for one', async () => {
        invoke.mockImplementation(answering([line('recent')]));
        renderWithQuery(<LogsTab name="web-1" namespace="team-a" pod={pod} />);
        await screen.findByText('recent');
        await userEvent.click(screen.getByRole('button', { name: 'Tail' }));
        await userEvent.click(await screen.findByRole('menuitem', { name: '100' }));
        await waitFor(() =>
            expect(invoke).toHaveBeenCalledWith('pods.logSnapshot', expect.objectContaining({ tailLines: 100 })),
        );
    });
});

describe('OverviewTab', () => {
    it('renders metric placeholders, conditions, and every container with facts and probes', () => {
        renderWithQuery(<OverviewTab name="web-1" namespace="team-a" pod={pod} />);
        // "CPU" now names both the pod metric card and each container's usage row.
        expect(screen.getAllByText('CPU').length).toBeGreaterThan(0);
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

    it('shows each container’s usage against what it asked for', () => {
        const withUsage = {
            ...pod,
            containers: [
                {
                    ...pod.containers[0],
                    name: 'web',
                    role: 'app' as const,
                    cpuUsed: 60,
                    memUsed: 96,
                    cpuRequested: 200,
                    memRequested: 128,
                },
                { ...pod.containers[0], name: 'migrate', role: 'init' as const, cpuUsed: null, memUsed: null },
            ],
        };
        renderWithQuery(<OverviewTab name="web-1" namespace="team-a" pod={withUsage} />);
        const web = screen.getByTestId('containers').querySelector('[data-container="web"]') as HTMLElement;
        expect(within(web).getByText('60m of 200m')).toBeInTheDocument();
        expect(within(web).getByRole('progressbar', { name: 'CPU against request' })).toHaveAttribute(
            'aria-valuenow',
            '30',
        );
        // An init container is labelled as one, and shows a dash until metrics-server reports it.
        const migrate = screen.getByTestId('containers').querySelector('[data-container="migrate"]') as HTMLElement;
        expect(within(migrate).getByText('init')).toBeInTheDocument();
        expect(within(migrate).queryByRole('progressbar')).not.toBeInTheDocument();
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
