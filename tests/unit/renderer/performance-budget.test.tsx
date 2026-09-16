import { screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRootRoute, createRoute, Outlet } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { renderRoutes } from './helpers';

const invoke = vi.fn();
vi.mock('@/lib/ipc', async () => ({
    ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')),
    invoke,
}));

const { LayersIcon } = await import('lucide-react');
const { ResourceListPage } = await import('@/components/templates/resource-list-page');
const { ageColumn, nameColumn, textColumn } = await import('@/components/templates/list-columns');

interface Row {
    name: string;
    namespace: string;
    status: string;
    age: string;
}

const columns: ColumnDef<Row>[] = [
    nameColumn<Row>({ href: (row) => `/pods/${row.name}` }),
    textColumn<Row>('namespace', 'Namespace'),
    textColumn<Row>('status', 'Status'),
    ageColumn<Row>(),
];

/**
 * What a list screen may cost, locked in so a change that renders every row cannot pass unnoticed.
 * Counted in DOM nodes rather than milliseconds: a time budget on a shared CI runner measures the
 * runner, while the number of elements a screen mounts is exactly the thing being promised.
 */
const CELL_BUDGET = 600;

const okQuery = (data: Row[]) => ({ data, isPending: false, isError: false, error: null, refetch: vi.fn() });

/** The list screen at `/`, with somewhere for a row link to point. */
function renderList(rows: Row[]) {
    const root = createRootRoute({ component: Outlet });
    const index = createRoute({
        getParentRoute: () => root,
        path: '/',
        component: () => (
            <ResourceListPage<Row>
                icon={LayersIcon}
                title="Pods"
                columns={columns}
                query={okQuery(rows) as never}
                testId="budget-list"
            />
        ),
    });
    const detail = createRoute({ getParentRoute: () => root, path: '/$rest', component: () => <p>detail</p> });
    return renderRoutes(root.addChildren([index, detail]), '/');
}

const rowsOf = (count: number): Row[] =>
    Array.from({ length: count }, (_, i) => ({
        name: `pod-${String(i).padStart(5, '0')}`,
        namespace: 'team-a',
        status: 'Running',
        age: '2h',
    }));

beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue(null);
});

describe('what a list screen costs', () => {
    it('mounts a bounded number of cells for five thousand objects', async () => {
        renderList(rowsOf(5_000));
        const list = await screen.findByTestId('budget-list');
        const cells = within(list).getAllByRole('cell');
        expect(cells.length).toBeGreaterThan(0);
        expect(cells.length).toBeLessThan(CELL_BUDGET);
    });

    it('costs no more for five thousand than for five hundred', async () => {
        const count = async (rows: Row[]) => {
            const { unmount } = renderList(rows);
            const list = await screen.findByTestId('budget-list');
            const cells = within(list).getAllByRole('cell').length;
            unmount();
            return cells;
        };
        // The screen's cost follows the window, not the cluster: ten times the objects, same DOM.
        expect(await count(rowsOf(5_000))).toBe(await count(rowsOf(500)));
    });
});
