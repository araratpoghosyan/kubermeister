import { useCallback } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerIcon } from 'lucide-react';
import type { Node } from '../../../shared/k8s/nodes';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, meterColumn, nameColumn, statusColumn, textColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';
import { NODE_TONE } from '@/lib/status';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/overview/nodes')({ component: NodesPage });

const detailPath = (node: Pick<Node, 'name'>) => `/overview/nodes/${encodeURIComponent(node.name)}`;

/** A node row with its pod count once the (separate, whole-cluster) count read has answered. */
type NodeRow = Node & { pods: number | string };

const columns: ColumnDef<NodeRow>[] = [
    nameColumn<NodeRow>({ href: detailPath }),
    statusColumn<NodeRow, Node['status']>(NODE_TONE, { size: 110 }),
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
    textColumn<NodeRow>('version', 'Version', { size: 90, mono: true, small: true, numeric: true }),
    meterColumn<NodeRow>('cpuUsed', 'CPU', (n) => n.cpuUsed, { size: 140, emptyLabel: 'no data' }),
    meterColumn<NodeRow>('memUsed', 'Memory', (n) => n.memUsed, { size: 140, emptyLabel: 'no data' }),
    textColumn<NodeRow>('pods', 'Pods', { size: 70, mono: true, numeric: true }),
    ageColumn<NodeRow>(),
    textColumn<NodeRow>('instanceType', 'Instance type', { size: 140, mono: true, small: true, muted: true }),
];

function NodesPage() {
    const refetchInterval = useRefreshIntervalMs();
    // The node list is a few kilobytes and renders at once; the counts are a whole-cluster pod
    // list, so the column shows a dash until they land.
    const counts = useIpcQuery('nodes.podCounts', {}, { refetchInterval }).data;
    const withCounts = useCallback(
        (rows: Node[]): NodeRow[] => rows.map((node) => ({ ...node, pods: counts ? (counts[node.name] ?? 0) : '—' })),
        [counts],
    );
    const nodes = useIpcQuery<'nodes.list', NodeRow[]>('nodes.list', {}, { refetchInterval, select: withCounts });
    return (
        <ResourceListPage<NodeRow>
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
