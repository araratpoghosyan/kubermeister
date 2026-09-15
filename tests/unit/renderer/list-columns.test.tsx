import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { type ColumnDef, getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ServerIcon } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';
import { DataTable } from '@/components/data-display/data-table';
import { Meter } from '@/components/data-display/meter';
import {
    ageColumn,
    ageToSeconds,
    meterColumn,
    nameColumn,
    namespaceColumn,
    parseRatio,
    readyRatioColumn,
    statusColumn,
    textColumn,
} from '@/components/templates/list-columns';

interface Row {
    name: string;
    namespace?: string;
    status: 'Ready' | 'NotReady';
    ready: string;
    cpu: number;
    used: number | null;
    note?: string;
    age: string;
}
const rows: Row[] = [
    { name: 'a', namespace: 'ns-1', status: 'Ready', ready: '2/2', cpu: 4, used: 95, note: 'x', age: '3d' },
    { name: 'b', status: 'NotReady', ready: '1/3', cpu: 2, used: null, age: '5m' },
];

function Harness({ columns, onRowClick }: { columns: ColumnDef<Row>[]; onRowClick?: (row: Row) => void }) {
    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({ data: rows, columns, getCoreRowModel: getCoreRowModel() });
    return (
        <DataTable table={table} onRowClick={onRowClick} rowProps={(row) => ({ 'data-row': row.name })} testId="t" />
    );
}

function renderColumns(columns: ColumnDef<Row>[], onRowClick?: (row: Row) => void) {
    const root = createRootRoute({ component: () => <Harness columns={columns} onRowClick={onRowClick} /> });
    const router = createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ['/'] }) });
    render(<RouterProvider router={router} />);
    return router;
}

const accessor = <T,>(column: ColumnDef<T>, row: T) =>
    (column as { accessorFn: (row: T, index: number) => unknown }).accessorFn(row, 0);

describe('ageToSeconds', () => {
    it('sums kubectl-style units and ignores garbage', () => {
        expect(ageToSeconds('45s')).toBe(45);
        expect(ageToSeconds('1h42m')).toBe(6120);
        expect(ageToSeconds('3d')).toBe(259_200);
        expect(ageToSeconds('—')).toBe(0);
    });
});

describe('parseRatio', () => {
    it('parses n/m, tolerating malformed input', () => {
        expect(parseRatio('3/3')).toEqual({ completed: 3, desired: 3, ratio: 1, complete: true });
        expect(parseRatio('1/4')).toMatchObject({ ratio: 0.25, complete: false });
        expect(parseRatio('0/0')).toMatchObject({ ratio: 0, complete: false });
        expect(parseRatio('—')).toEqual({ completed: 0, desired: 0, ratio: 0, complete: false });
    });
});

describe('column factories', () => {
    it('render name with icon and optional detail link, text with formatting, status tones, ratios and age', async () => {
        renderColumns([
            nameColumn<Row>({ icon: ServerIcon, mono: true, href: (row) => `/${row.name}` }),
            namespaceColumn<Row>(),
            statusColumn<Row, Row['status']>({ Ready: 'ok', NotReady: 'danger' }),
            readyRatioColumn<Row>('ready'),
            textColumn<Row>('cpu', 'CPU', { numeric: true, mono: true, muted: true, small: true, truncate: true }),
            textColumn<Row>('note', 'Note'),
            ageColumn<Row>(),
        ]);
        const table = await screen.findByTestId('t');
        expect(within(table).getByRole('link', { name: 'a' })).toHaveAttribute('href', '/a');
        expect(within(table).getByRole('link', { name: 'a' })).toHaveClass('font-mono');
        expect(table.querySelectorAll('svg.lucide-server')).toHaveLength(2);
        const rowA = table.querySelector('[data-row="a"]') as HTMLElement;
        const rowB = table.querySelector('[data-row="b"]') as HTMLElement;
        expect(rowA).toHaveTextContent('ns-1');
        expect(rowB).toHaveTextContent('—');
        expect(within(rowA).getByText('Ready')).toHaveAttribute('data-tone', 'ok');
        expect(within(rowB).getByText('NotReady')).toHaveAttribute('data-tone', 'danger');
        expect(within(rowA).getByText('2/2')).toHaveClass('text-ok');
        expect(within(rowB).getByText('1/3')).toHaveClass('text-warn');
        expect(within(rowA).getByText('4')).toHaveClass(
            'tabular-nums',
            'font-mono',
            'text-text-muted',
            'text-meta',
            'block',
            'truncate',
        );
        expect(within(rowA).getByText('x')).toBeInTheDocument();
        expect(within(rowA).getByText('3d')).toHaveClass('font-mono');
    });

    it('renders a plain name without a link when no href is given', async () => {
        renderColumns([nameColumn<Row>()]);
        const table = await screen.findByTestId('t');
        expect(within(table).queryByRole('link')).not.toBeInTheDocument();
        expect(within(table).getByText('a')).toHaveClass('text-primary');
    });

    it('exposes sortable accessors: age by duration, ready by ratio, namespace with an empty fallback', () => {
        expect(accessor(ageColumn<Row>(), rows[0]!)).toBe(259_200);
        expect(accessor(readyRatioColumn<Row>('ready'), rows[1]!)).toBeCloseTo(1 / 3);
        expect(accessor(namespaceColumn<Row>(), rows[1]!)).toBe('');
        expect(accessor(statusColumn<Row, Row['status']>({ Ready: 'ok', NotReady: 'danger' }), rows[0]!)).toBe('Ready');
        expect(accessor(textColumn<Row>('note', 'Note'), rows[1]!)).toBeUndefined();
    });
});

describe('DataTable', () => {
    it('calls the row handler with the row model and marks clickable rows', async () => {
        const onRowClick = vi.fn();
        renderColumns([nameColumn<Row>(), textColumn<Row>('cpu', 'CPU', { size: 80 })], onRowClick);
        const table = await screen.findByTestId('t');
        const rowB = table.querySelector('[data-row="b"]') as HTMLElement;
        expect(rowB).toHaveClass('cursor-pointer');
        await userEvent.click(within(rowB).getByText('b'));
        expect(onRowClick).toHaveBeenCalledWith(rows[1]);
        expect(within(table).getAllByRole('columnheader')[1]).toHaveStyle({ width: '80px' });
        expect(within(table).getAllByRole('columnheader')[0]).toHaveAttribute('aria-sort', 'none');
    });

    it('renders rows as plain rows when there is no click handler', async () => {
        renderColumns([nameColumn<Row>()]);
        const table = await screen.findByTestId('t');
        expect(table.querySelector('[data-row="a"]')).not.toHaveClass('cursor-pointer');
    });
});

describe('Meter and meterColumn', () => {
    it('clamps the value, exposes it as a progressbar, and colors by tone', () => {
        const { rerender } = render(<Meter value={140} tone="danger" label="CPU usage" />);
        const bar = screen.getByRole('progressbar', { name: 'CPU usage' });
        expect(bar).toHaveAttribute('aria-valuenow', '100');
        expect(bar.firstElementChild).toHaveStyle({ width: '100%' });
        expect(bar.firstElementChild).toHaveClass('bg-danger');
        rerender(<Meter value={-5} />);
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
        expect(screen.getByRole('progressbar').firstElementChild).toHaveClass('bg-primary');
    });

    it('renders a toned meter with a label, or the empty label when there is nothing to measure', async () => {
        renderColumns([
            meterColumn<Row>('used', 'CPU', (row) => row.used, {
                label: (row) => `${row.cpu}m`,
                emptyLabel: 'no data',
            }),
        ]);
        const table = await screen.findByTestId('t');
        const rowA = table.querySelector('[data-row="a"]') as HTMLElement;
        const rowB = table.querySelector('[data-row="b"]') as HTMLElement;
        expect(rowA).toHaveTextContent('4m');
        expect(within(rowA).getByRole('progressbar', { name: 'CPU usage' })).toHaveAttribute('aria-valuenow', '95');
        expect(within(rowA).getByRole('progressbar').firstElementChild).toHaveClass('bg-danger');
        expect(rowB).toHaveTextContent('no data');
        expect(within(rowB).queryByRole('progressbar')).not.toBeInTheDocument();
        const column = meterColumn<Row>('used', 'CPU', (row) => row.used);
        expect(accessor(column, rows[0]!)).toBe(95);
        expect(accessor(column, rows[1]!)).toBe(-1);
    });

    it('defaults the label to the percentage and the empty text to no limit', async () => {
        renderColumns([meterColumn<Row>('used', 'Memory', (row) => row.used)]);
        const table = await screen.findByTestId('t');
        expect(table.querySelector('[data-row="a"]')).toHaveTextContent('95%');
        expect(table.querySelector('[data-row="b"]')).toHaveTextContent('no limit');
    });
});
