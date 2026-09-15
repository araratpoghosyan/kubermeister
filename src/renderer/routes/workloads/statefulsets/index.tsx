import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BoxesIcon } from 'lucide-react';
import type { StatefulSet } from '../../../../shared/k8s/workloads';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn, readyRatioColumn, textColumn } from '@/components/templates/list-columns';
import { useWatchedList } from '@/lib/watch';

export const Route = createFileRoute('/workloads/statefulsets/')({ component: StatefulSetsPage });

const detailPath = (s: Pick<StatefulSet, 'namespace' | 'name'>) =>
    `/workloads/statefulsets/${encodeURIComponent(s.namespace)}/${encodeURIComponent(s.name)}`;

const columns: ColumnDef<StatefulSet>[] = [
    nameColumn<StatefulSet>({ href: detailPath }),
    readyRatioColumn<StatefulSet>('ready'),
    textColumn<StatefulSet>('service', 'Service', { size: 200 }),
    textColumn<StatefulSet>('image', 'Image', { mono: true, small: true, muted: true, truncate: true }),
    ageColumn<StatefulSet>(),
];

function StatefulSetsPage() {
    const sets = useWatchedList('StatefulSet');
    return (
        <ResourceListPage
            icon={BoxesIcon}
            title="StatefulSets"
            columns={columns}
            query={sets}
            detailPath={detailPath}
            rowProps={(s) => ({ 'data-statefulset': s.name })}
            testId="statefulsets-table"
            footerNote={sets.live ? 'live' : undefined}
        />
    );
}
