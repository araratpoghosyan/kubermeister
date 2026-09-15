import { flexRender, type Table as TanstackTable } from '@tanstack/react-table';
import { ArrowDownIcon, ArrowUpIcon, ChevronsUpDownIcon } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

interface DataTableProps<TData> {
    table: TanstackTable<TData>;
    onRowClick?: (row: TData) => void;
    /** Extra attributes per row (`data-*` hooks for tests and styling). */
    rowProps?: (row: TData) => Record<string, string>;
    containerClassName?: string;
    testId?: string;
}

// Rows are not virtualized: `ResourceListPage` paginates client-side (`PAGE_SIZE = 50`), so this only
// ever renders one page's worth of rows. Add `@tanstack/react-virtual` here before raising that page
// size; virtualizing 50 rows would be pure overhead today.
export function DataTable<TData>({ table, onRowClick, rowProps, containerClassName, testId }: DataTableProps<TData>) {
    return (
        <Table containerClassName={cn('overflow-auto', containerClassName)} data-testid={testId}>
            <TableHeader className="sticky top-0 z-10 bg-card">
                {table.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id} className="border-border hover:bg-transparent">
                        {headerGroup.headers.map((header) => {
                            const size = header.column.columnDef.size;
                            const sorted = header.column.getIsSorted();
                            const label = header.isPlaceholder
                                ? null
                                : flexRender(header.column.columnDef.header, header.getContext());
                            return (
                                <TableHead
                                    key={header.id}
                                    style={size ? { width: `${size}px` } : undefined}
                                    aria-sort={
                                        sorted === 'asc'
                                            ? 'ascending'
                                            : sorted === 'desc'
                                              ? 'descending'
                                              : header.column.getCanSort()
                                                ? 'none'
                                                : undefined
                                    }
                                    className="h-9 text-caption font-medium tracking-wider text-text-muted uppercase"
                                >
                                    {header.column.getCanSort() ? (
                                        <button
                                            type="button"
                                            onClick={header.column.getToggleSortingHandler()}
                                            className="flex cursor-pointer items-center gap-1 select-none hover:text-text-2"
                                        >
                                            {label}
                                            {sorted === 'asc' ? (
                                                <ArrowUpIcon className="size-3" />
                                            ) : sorted === 'desc' ? (
                                                <ArrowDownIcon className="size-3" />
                                            ) : (
                                                <ChevronsUpDownIcon className="size-3 opacity-40" />
                                            )}
                                        </button>
                                    ) : (
                                        label
                                    )}
                                </TableHead>
                            );
                        })}
                    </TableRow>
                ))}
            </TableHeader>
            <TableBody>
                {table.getRowModel().rows.map((row) => (
                    <TableRow
                        key={row.id}
                        {...rowProps?.(row.original)}
                        // The whole row is a click target for convenience; keyboard users reach the
                        // detail through the Name cell's link, so the row itself is not focusable.
                        onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                        className={cn('border-border hover:bg-elev-2', onRowClick && 'cursor-pointer')}
                    >
                        {row.getVisibleCells().map((cell) => (
                            <TableCell key={cell.id} className="px-3 py-2.5 text-body text-text-2">
                                {flexRender(cell.column.columnDef.cell, cell.getContext())}
                            </TableCell>
                        ))}
                    </TableRow>
                ))}
            </TableBody>
        </Table>
    );
}
