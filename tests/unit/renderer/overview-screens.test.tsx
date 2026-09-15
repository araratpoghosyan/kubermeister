import { screen, within } from '@testing-library/react';
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

const data: Record<string, unknown> = {
    'update.state': { status: 'up-to-date' },
    'contexts.list': [{ name: 'alpha', cluster: 'a', user: 'u', current: true }],
    'namespaces.list': [{ name: 'team-a', pods: 1, tone: 'accent' }],
    'namespace.active': { name: 'team-a', pods: 1, tone: 'accent' },
    'cluster.active': null,
    'events.list': [
        {
            time: '12:00:05',
            type: 'Warning',
            reason: 'BackOff',
            object: 'pod/web-1',
            namespace: 'team-a',
            message: 'restarting failed container',
        },
        {
            time: '12:00:00',
            type: 'Normal',
            reason: 'Scheduled',
            object: 'pod/web-1',
            namespace: 'team-a',
            message: 'assigned',
        },
    ],
    'quotas.list': [
        {
            namespace: 'team-a',
            name: 'team-quota',
            resource: 'requests.cpu',
            used: '1',
            hard: '4',
            remaining: '3',
            usage: 25,
        },
        {
            namespace: 'team-a',
            name: 'team-quota',
            resource: 'pods',
            used: '19',
            hard: '20',
            remaining: '1',
            usage: 95,
        },
    ],
    'limits.list': [
        {
            namespace: 'team-a',
            name: 'team-limits',
            type: 'Container',
            resource: 'cpu',
            min: '100m',
            defaultRequest: '200m',
            defaultLimit: '500m',
            max: '2',
            maxRatio: '4',
        },
    ],
};

beforeEach(() => {
    invoke.mockReset();
    invoke.mockImplementation(async (channel: string) => data[channel]);
});

describe('overview screens', () => {
    it('lists events newest first with a toned type badge', async () => {
        renderRoutes(routeTree, '/overview/events');
        const table = await screen.findByTestId('events-table');
        const rows = within(table).getAllByRole('row').slice(1);
        expect(rows).toHaveLength(2);
        expect(within(rows[0]!).getByText('Warning')).toHaveClass('text-warn');
        expect(within(rows[1]!).getByText('Normal')).not.toHaveClass('text-warn');
        expect(rows[0]).toHaveTextContent('BackOff');
        expect(rows[0]).toHaveTextContent('pod/web-1');
        expect(rows[0]).toHaveTextContent('restarting failed container');
        expect(screen.getByTestId('resource-list')).toHaveTextContent('newest first');
    });

    it('lists quotas with a usage meter toned by pressure', async () => {
        renderRoutes(routeTree, '/overview/quotas');
        const table = await screen.findByTestId('quotas-table');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((h) => h.textContent),
        ).toEqual(['Namespace', 'Quota', 'Resource', 'Used', 'Hard limit', 'Remaining', 'Usage']);
        const meters = within(table).getAllByRole('progressbar', { name: 'Usage usage' });
        expect(meters[0]).toHaveAttribute('aria-valuenow', '25');
        expect(meters[0]?.firstElementChild).toHaveClass('bg-ok');
        expect(meters[1]).toHaveAttribute('aria-valuenow', '95');
        expect(meters[1]?.firstElementChild).toHaveClass('bg-danger');
        expect(screen.getByTestId('resource-list')).toHaveTextContent('grouped by namespace');
    });

    it('lists limit ranges with every column', async () => {
        renderRoutes(routeTree, '/overview/limits');
        const table = await screen.findByTestId('limits-table');
        expect(
            within(table)
                .getAllByRole('columnheader')
                .map((h) => h.textContent),
        ).toEqual([
            'Namespace',
            'Limit range',
            'Type',
            'Resource',
            'Min',
            'Default request',
            'Default limit',
            'Max',
            'Max ratio',
        ]);
        expect(table).toHaveTextContent('Container');
        expect(table).toHaveTextContent('100m');
    });

    it('reaches all three from the sidebar in the expected order', async () => {
        renderRoutes(routeTree, '/overview/summary');
        const sidebar = await screen.findByTestId('sidebar');
        const overview = within(sidebar)
            .getAllByRole('link')
            .map((l) => l.textContent)
            .slice(0, 6);
        expect(overview).toEqual(['Cluster summary', 'Nodes', 'Namespaces', 'Events stream', 'Quotas', 'Limits']);
    });
});
