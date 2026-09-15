import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { CalendarClockIcon } from 'lucide-react';
import type { ClusterEvent } from '../../../shared/k8s/events';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { textColumn } from '@/components/templates/list-columns';
import { Badge } from '@/components/ui/badge';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';

export const Route = createFileRoute('/overview/events')({ component: EventsPage });

const columns: ColumnDef<ClusterEvent>[] = [
    {
        id: 'time',
        header: 'Time',
        size: 90,
        accessorFn: (row) => row.time,
        cell: ({ row }) => <span className="font-mono text-text-dim tabular-nums">{row.original.time}</span>,
    },
    {
        id: 'type',
        header: 'Type',
        size: 90,
        accessorFn: (row) => row.type,
        cell: ({ row }) => (
            <Badge variant={row.original.type === 'Warning' ? 'warn' : 'neutral'} className="rounded-sm">
                {row.original.type}
            </Badge>
        ),
    },
    {
        id: 'reason',
        header: 'Reason',
        size: 170,
        accessorFn: (row) => row.reason,
        cell: ({ row }) => <span className="font-medium text-text-2">{row.original.reason}</span>,
    },
    {
        id: 'object',
        header: 'Object',
        size: 280,
        accessorFn: (row) => row.object,
        cell: ({ row }) => <span className="font-mono text-meta text-primary">{row.original.object}</span>,
    },
    textColumn<ClusterEvent>('namespace', 'Namespace', { size: 140, mono: true, small: true }),
    textColumn<ClusterEvent>('message', 'Message', { muted: true, truncate: true }),
];

function EventsPage() {
    const events = useIpcQuery('events.list', {}, { refetchInterval: useRefreshIntervalMs() });
    return (
        <ResourceListPage
            icon={CalendarClockIcon}
            title="Events"
            columns={columns}
            query={events}
            footerNote="newest first"
            testId="events-table"
        />
    );
}
