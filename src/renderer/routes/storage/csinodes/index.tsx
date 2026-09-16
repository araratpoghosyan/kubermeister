import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerIcon } from 'lucide-react';
import type { CsiNode } from '../../../../shared/k8s/csi';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn, textColumn } from '@/components/templates/list-columns';
import { useFilteredList } from '@/components/list/use-filtered-list';

export const Route = createFileRoute('/storage/csinodes/')({ component: CsiNodesPage });

const detailPath = (node: Pick<CsiNode, 'name'>) => `/storage/csinodes/${encodeURIComponent(node.name)}`;

const columns: ColumnDef<CsiNode>[] = [
    nameColumn<CsiNode>({ href: detailPath }),
    textColumn<CsiNode>('drivers', 'Drivers', { size: 90, mono: true, numeric: true }),
    textColumn<CsiNode>('driverNames', 'Registered', { mono: true, small: true }),
    ageColumn<CsiNode>(),
];

function CsiNodesPage() {
    const nodes = useFilteredList('CSINode');
    return (
        <ResourceListPage
            icon={ServerIcon}
            title="CSINodes"
            columns={columns}
            query={nodes}
            toolbar={nodes.filter}
            detailPath={detailPath}
            rowProps={(node) => ({ 'data-csinode': node.name })}
            bulkDelete={{ kind: 'CSINode' }}
            testId="csinodes-table"
            footerNote={nodes.live ? 'live' : undefined}
        />
    );
}
