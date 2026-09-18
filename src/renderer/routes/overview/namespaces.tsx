import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { BoxesIcon } from 'lucide-react';
import type { Namespace } from '../../../shared/k8s/cluster';
import { useCallback } from 'react';
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

/** A namespace row with its pod count once the (separate, heavier) count read has answered. */
type NamespaceRow = Namespace & { pods: number | string };

const columns: ColumnDef<NamespaceRow>[] = [
    nameColumn<NamespaceRow>({ icon: BoxesIcon, href: detailPath }),
    {
        id: 'tone',
        header: 'Status',
        size: 120,
        accessorFn: (row) => row.tone,
        cell: ({ row }) => (
            <StatusBadge tone={NAMESPACE_TONE[row.original.tone]}>{TONE_LABEL[row.original.tone]}</StatusBadge>
        ),
    },
    textColumn<NamespaceRow>('pods', 'Pods', { size: 80, numeric: true, mono: true }),
];

function NamespacesPage() {
    const refetchInterval = useRefreshIntervalMs();
    // The namespace list is small and arrives first; the counts are a whole-cluster pod list, so
    // the rows render without them and fill in when they land.
    const counts = useIpcQuery('namespaces.podCounts', {}, { refetchInterval }).data;
    const withCounts = useCallback(
        (namespaces: Namespace[]): NamespaceRow[] =>
            namespaces.map((ns) => ({ ...ns, pods: counts ? (counts[ns.name] ?? 0) : '—' })),
        [counts],
    );
    const namespaces = useIpcQuery<'namespaces.list', NamespaceRow[]>(
        'namespaces.list',
        {},
        { refetchInterval, select: withCounts },
    );
    return (
        <ResourceListPage<NamespaceRow>
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
