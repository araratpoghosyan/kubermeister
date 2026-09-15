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

const job = {
    name: 'import',
    namespace: 'team-a',
    completions: '3/3',
    duration: '1h0m',
    status: 'Complete',
    age: '1h',
};
const failed = { ...job, name: 'broken', completions: '0/1', status: 'Failed' };
const cronJob = {
    name: 'nightly',
    namespace: 'team-a',
    schedule: '0 2 * * *',
    suspend: false,
    active: 1,
    lastSchedule: '2h ago',
    age: '3d',
};
const autoscaler = {
    name: 'web',
    namespace: 'team-a',
    reference: 'Deployment/web',
    min: 2,
    max: 10,
    replicas: 3,
    targets: '42% / 80%',
    age: '1h',
};
const meta = { labels: [['app', 'web']], annotations: [] };
const rows: Record<string, unknown[]> = {
    Job: [job, failed],
    CronJob: [cronJob, { ...cronJob, name: 'paused', suspend: true, active: 0 }],
    HorizontalPodAutoscaler: [autoscaler],
};
const details: Record<string, unknown> = {
    Job: { ...job, ...meta },
    CronJob: { ...cronJob, ...meta },
    HorizontalPodAutoscaler: { ...autoscaler, ...meta },
};
const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'context.current': { name: 'alpha', cluster: 'a', user: 'u', current: true },
    'namespaces.list': [{ name: 'team-a', pods: 3, tone: 'accent' }],
    'namespace.active': { name: 'team-a', pods: 3, tone: 'accent' },
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

describe('batch and autoscaler lists', () => {
    it('lists jobs with completion ratios and status tones', async () => {
        renderRoutes(routeTree, '/workloads/jobs');
        const table = await screen.findByTestId('jobs-table');
        expect(invoke).toHaveBeenCalledWith('resources.list', { kind: 'Job', namespace: undefined });
        const done = table.querySelector('[data-job="import"]') as HTMLElement;
        expect(within(done).getByRole('link', { name: 'import' })).toHaveAttribute(
            'href',
            '/workloads/jobs/team-a/import',
        );
        expect(within(done).getByText('3/3')).toHaveClass('text-ok');
        expect(within(done).getByText('Complete')).toHaveAttribute('data-tone', 'ok');
        expect(done).toHaveTextContent('1h0m');
        const broken = table.querySelector('[data-job="broken"]') as HTMLElement;
        expect(within(broken).getByText('Failed')).toHaveAttribute('data-tone', 'danger');
        expect(within(broken).getByText('0/1')).toHaveClass('text-warn');
    });

    it('lists cron jobs, toning suspension and active runs', async () => {
        renderRoutes(routeTree, '/workloads/cronjobs');
        const table = await screen.findByTestId('cronjobs-table');
        const nightly = table.querySelector('[data-cronjob="nightly"]') as HTMLElement;
        expect(nightly).toHaveTextContent('0 2 * * *');
        expect(within(nightly).getByText('false')).toHaveClass('text-text-muted');
        expect(within(nightly).getByText('1')).toHaveClass('text-primary');
        expect(nightly).toHaveTextContent('2h ago');
        const paused = table.querySelector('[data-cronjob="paused"]') as HTMLElement;
        expect(within(paused).getByText('true')).toHaveClass('text-warn');
        expect(within(paused).getByText('0')).toHaveClass('text-text-muted');
    });

    it('lists autoscalers with their scale reference and bounds', async () => {
        renderRoutes(routeTree, '/workloads/autoscalers');
        const table = await screen.findByTestId('autoscalers-table');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((h) => h.textContent),
        ).toEqual(['Name', 'Reference', 'Min', 'Max', 'Replicas', 'Targets', 'Age']);
        const row = table.querySelector('[data-autoscaler="web"]') as HTMLElement;
        expect(row).toHaveTextContent('Deployment/web');
        expect(row).toHaveTextContent('42% / 80%');
        expect(within(row).getByRole('link', { name: 'web' })).toHaveAttribute(
            'href',
            '/workloads/autoscalers/team-a/web',
        );
    });
});

describe('batch and autoscaler details', () => {
    it('renders the job detail with its status badge and overview rows', async () => {
        renderRoutes(routeTree, '/workloads/jobs/team-a/import');
        const page = await screen.findByTestId('job-page');
        await waitFor(() => expect(page).toHaveTextContent('completions: 3/3'));
        expect(page).toHaveTextContent('duration: 1h0m');
        expect(within(page).getAllByText('Complete', { selector: '[data-tone]' })[0]).toHaveAttribute(
            'data-tone',
            'ok',
        );
        expect(within(page).getByText('Completions')).toBeInTheDocument();
        const rail = within(page).getByRole('tablist');
        expect(
            within(rail)
                .getAllByRole('tab')
                .map((t) => t.textContent),
        ).toEqual(['Overview', 'Events', 'Labels1']);
        await userEvent.click(within(rail).getByRole('tab', { name: 'Events' }));
        expect(invoke).toHaveBeenCalledWith('events.forObject', { kind: 'Job', name: 'import', namespace: 'team-a' });
    });

    it('renders the cron job and autoscaler details and a not-found state', async () => {
        renderRoutes(routeTree, '/workloads/cronjobs/team-a/nightly');
        const cron = await screen.findByTestId('cronjob-page');
        await waitFor(() => expect(cron).toHaveTextContent('schedule: 0 2 * * *'));
        expect(cron).toHaveTextContent('suspended: false');
        expect(cron).toHaveTextContent('Last schedule');

        const { router } = renderRoutes(routeTree, '/workloads/autoscalers/team-a/web');
        const hpa = await screen.findByTestId('autoscaler-page');
        await waitFor(() => expect(hpa).toHaveTextContent('reference: Deployment/web'));
        expect(hpa).toHaveTextContent('replicas: 3');
        expect(hpa).toHaveTextContent('42% / 80%');

        invoke.mockImplementation(async (channel: string, input: { kind?: string }) =>
            channel === 'resources.get' ? { kind: input.kind, item: null } : data[channel],
        );
        await router.navigate({
            to: '/workloads/autoscalers/$namespace/$name',
            params: { namespace: 'team-a', name: 'ghost' },
        });
        expect(await screen.findByTestId('not-found')).toHaveTextContent(
            'HorizontalPodAutoscaler “ghost” was not found in namespace “team-a”.',
        );
    });
});
