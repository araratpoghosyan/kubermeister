import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { LayersIcon } from 'lucide-react';
import type { Pod } from '../../../../shared/k8s/pods';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn, readyRatioColumn, statusColumn, textColumn } from '@/components/templates/list-columns';
import { POD_TONE } from '@/lib/status';
import { useWatchedList } from '@/lib/watch';

export const Route = createFileRoute('/workloads/pods/')({ component: PodsPage });

const detailPath = (pod: Pick<Pod, 'namespace' | 'name'>) =>
    `/workloads/pods/${encodeURIComponent(pod.namespace)}/${encodeURIComponent(pod.name)}`;

const columns: ColumnDef<Pod>[] = [
    nameColumn<Pod>({ href: detailPath }),
    statusColumn<Pod, Pod['status']>(POD_TONE),
    readyRatioColumn<Pod>('ready'),
    textColumn<Pod>('restarts', 'Restarts', { size: 90, numeric: true, mono: true }),
    textColumn<Pod>('node', 'Node', { size: 160, muted: true, truncate: true }),
    ageColumn<Pod>(),
];

function PodsPage() {
    const pods = useWatchedList('Pod');
    return (
        <div className="h-full" data-testid="pods-page" data-live={String(pods.live)}>
            <ResourceListPage
                icon={LayersIcon}
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
