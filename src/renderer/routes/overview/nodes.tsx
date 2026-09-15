import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerIcon } from 'lucide-react';
import type { Node } from '../../../shared/k8s/nodes';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, meterColumn, nameColumn, statusColumn, textColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { NODE_TONE } from '@/lib/status';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/overview/nodes')({ component: NodesPage });

const detailPath = (node: Pick<Node, 'name'>) => `/overview/nodes/${encodeURIComponent(node.name)}`;

const columns: ColumnDef<Node>[] = [
    nameColumn<Node>({ href: detailPath }),
    statusColumn<Node, Node['status']>(NODE_TONE, { size: 110 }),
    {
        id: 'role',
        header: 'Role',
        size: 120,
        accessorFn: (row) => row.role,
        cell: ({ row }) => (
            <span
                className={cn(
                    'font-mono text-meta',
                    row.original.role === 'control-plane' ? 'text-primary' : 'text-text-2',
                )}
            >
                {row.original.role}
            </span>
        ),
    },
    textColumn<Node>('version', 'Version', { size: 90, mono: true, small: true, numeric: true }),
    meterColumn<Node>('cpuUsed', 'CPU', (n) => n.cpuUsed, { size: 140, emptyLabel: 'no data' }),
    meterColumn<Node>('memUsed', 'Memory', (n) => n.memUsed, { size: 140, emptyLabel: 'no data' }),
    textColumn<Node>('pods', 'Pods', { size: 70, mono: true, numeric: true }),
    ageColumn<Node>(),
    textColumn<Node>('instanceType', 'Instance type', { size: 140, mono: true, small: true, muted: true }),
];

function NodesPage() {
    const nodes = useIpcQuery('nodes.list', {}, { refetchInterval: 15_000 });
    return (
        <ResourceListPage
            icon={ServerIcon}
            title="Nodes"
            columns={columns}
            query={nodes}
            detailPath={detailPath}
            rowProps={(node) => ({ 'data-node': node.name })}
            testId="nodes-table"
        />
    );
}
