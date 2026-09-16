import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BoxesIcon } from 'lucide-react';
import type { Namespace } from '../../../shared/k8s/cluster';
import { StatusBadge } from '@/components/data-display/status-badge';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { CreateNamespaceButton } from '@/components/namespace/create-namespace-button';
import { nameColumn, textColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';
import { NAMESPACE_TONE } from '@/lib/status';

export const Route = createFileRoute('/overview/namespaces')({ component: NamespacesPage });

const TONE_LABEL = { accent: 'Active', ok: 'Ready', warn: 'Terminating' } as const;

const detailPath = (ns: Pick<Namespace, 'name'>) => `/overview/namespaces/${encodeURIComponent(ns.name)}`;

const columns: ColumnDef<Namespace>[] = [
    nameColumn<Namespace>({ icon: BoxesIcon, href: detailPath }),
    {
        id: 'tone',
        header: 'Status',
        size: 120,
        accessorFn: (row) => row.tone,
        cell: ({ row }) => (
            <StatusBadge tone={NAMESPACE_TONE[row.original.tone]}>{TONE_LABEL[row.original.tone]}</StatusBadge>
        ),
    },
    textColumn<Namespace>('pods', 'Pods', { size: 80, numeric: true, mono: true }),
];

function NamespacesPage() {
    const namespaces = useIpcQuery('namespaces.list', {}, { refetchInterval: useRefreshIntervalMs() });
    return (
        <ResourceListPage
            icon={BoxesIcon}
            title="Namespaces"
            columns={columns}
            query={namespaces}
            detailPath={detailPath}
            toolbar={<CreateNamespaceButton />}
            rowProps={(ns) => ({ 'data-namespace': ns.name })}
            testId="namespaces-table"
        />
    );
}
