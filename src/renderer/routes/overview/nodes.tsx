import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { ServerIcon } from 'lucide-react';
import type { Node } from '../../../shared/k8s/nodes';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn, statusColumn, textColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { NODE_TONE } from '@/lib/status';

export const Route = createFileRoute('/overview/nodes')({ component: NodesPage });

const columns: ColumnDef<Node>[] = [
    nameColumn<Node>({ icon: ServerIcon }),
    statusColumn<Node, Node['status']>(NODE_TONE),
    textColumn<Node>('role', 'Role', { size: 140 }),
    textColumn<Node>('cpu', 'CPU', { size: 80, numeric: true, mono: true }),
    textColumn<Node>('memory', 'Memory (GiB)', { size: 120, numeric: true, mono: true }),
    textColumn<Node>('pods', 'Pods', { size: 80, numeric: true, mono: true }),
    textColumn<Node>('version', 'Version', { size: 140, mono: true, muted: true }),
    textColumn<Node>('instanceType', 'Instance', { size: 140, muted: true }),
    ageColumn<Node>(),
];

function NodesPage() {
    const nodes = useIpcQuery('nodes.list', {}, { refetchInterval: 15_000 });
    return <ResourceListPage icon={ServerIcon} title="Nodes" columns={columns} query={nodes} testId="nodes-table" />;
}
