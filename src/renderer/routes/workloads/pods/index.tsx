import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BoxIcon } from 'lucide-react';
import type { Pod } from '../../../../shared/k8s/pods';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, meterColumn, nameColumn, statusColumn } from '@/components/templates/list-columns';
import { POD_TONE } from '@/lib/status';
import { cn } from '@/lib/utils';
import { useWatchedList } from '@/lib/watch';

export const Route = createFileRoute('/workloads/pods/')({ component: PodsPage });

/** Usage as a percentage of the limit, or null when the pod declares no limit to measure against. */
export const pct = (used: number, limit?: number) => (limit ? Math.min(100, Math.round((used / limit) * 100)) : null);

const detailPath = (pod: Pick<Pod, 'namespace' | 'name'>) =>
    `/workloads/pods/${encodeURIComponent(pod.namespace)}/${encodeURIComponent(pod.name)}`;

const READY_TONE: Partial<Record<Pod['status'], string>> = { Running: 'text-ok', Pending: 'text-warn' };

const columns: ColumnDef<Pod>[] = [
    nameColumn<Pod>({ href: detailPath }),
    meterColumn<Pod>('cpu', 'CPU', (p) => pct(p.cpu, p.cpuLimit), {
        label: (p) => `${p.cpu}m`,
        labelClassName: 'w-10',
    }),
    meterColumn<Pod>('mem', 'Memory', (p) => pct(p.mem, p.memLimit), {
        label: (p) => `${p.mem}Mi`,
        labelClassName: 'w-11',
    }),
    {
        id: 'ready',
        header: 'Ready',
        size: 70,
        accessorFn: (row) => row.ready,
        cell: ({ row }) => (
            <span className={cn('font-mono tabular-nums', READY_TONE[row.original.status] ?? 'text-danger')}>
                {row.original.ready}
            </span>
        ),
    },
    statusColumn<Pod, Pod['status']>(POD_TONE, { size: 110 }),
    {
        id: 'restarts',
        header: 'Restarts',
        size: 80,
        accessorFn: (row) => row.restarts,
        cell: ({ row }) => (
            <span className={cn('font-mono tabular-nums', row.original.restarts > 0 ? 'text-warn' : 'text-text-muted')}>
                {row.original.restarts}
            </span>
        ),
    },
    ageColumn<Pod>(),
];

function PodsPage() {
    const pods = useWatchedList('Pod');
    return (
        <div className="h-full" data-testid="pods-page" data-live={String(pods.live)}>
            <ResourceListPage
                icon={BoxIcon}
                title="Pods"
                columns={columns}
                query={pods}
                detailPath={detailPath}
                rowProps={(pod) => ({ 'data-pod': pod.name })}
                testId="pods-table"
                footerNote={pods.live ? 'live' : undefined}
            />
        </div>
    );
}
