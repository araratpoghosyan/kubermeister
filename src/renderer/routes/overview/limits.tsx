import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { GaugeIcon } from 'lucide-react';
import type { LimitRange } from '../../../shared/k8s/overview';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { textColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';

export const Route = createFileRoute('/overview/limits')({ component: LimitsPage });

const columns: ColumnDef<LimitRange>[] = [
    {
        id: 'namespace',
        header: 'Namespace',
        accessorFn: (row) => row.namespace,
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.namespace}</span>,
    },
    textColumn<LimitRange>('name', 'Limit range', { size: 150 }),
    textColumn<LimitRange>('type', 'Type', { size: 110 }),
    textColumn<LimitRange>('resource', 'Resource', { size: 120, mono: true, small: true }),
    textColumn<LimitRange>('min', 'Min', { size: 100, mono: true, muted: true, numeric: true }),
    textColumn<LimitRange>('defaultRequest', 'Default request', { size: 130, mono: true, muted: true, numeric: true }),
    textColumn<LimitRange>('defaultLimit', 'Default limit', { size: 130, mono: true, muted: true, numeric: true }),
    textColumn<LimitRange>('max', 'Max', { size: 100, mono: true, muted: true, numeric: true }),
    textColumn<LimitRange>('maxRatio', 'Max ratio', { size: 100, mono: true, muted: true, numeric: true }),
];

function LimitsPage() {
    const limits = useIpcQuery('limits.list', {}, { refetchInterval: useRefreshIntervalMs() });
    return (
        <ResourceListPage
            icon={GaugeIcon}
            title="Limit ranges"
            nounPlural="limit ranges"
            columns={columns}
            query={limits}
            footerNote="grouped by namespace"
            testId="limits-table"
        />
    );
}
