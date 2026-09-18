import { createFileRoute } from '@tanstack/react-router';
import { useMemo } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CodeIcon } from 'lucide-react';
import type { CustomColumn, CustomResourceRow } from '../../../../../shared/k8s/custom';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';

export const Route = createFileRoute('/addons/instances/$crd/')({ component: InstancesPage });

/** A cluster-scoped instance has no namespace, and the route still needs a segment for one. */
export const NO_NAMESPACE = '-';

const detailPath = (crd: string, row: Pick<CustomResourceRow, 'namespace' | 'name'>) =>
    `/addons/instances/${encodeURIComponent(crd)}/${encodeURIComponent(row.namespace || NO_NAMESPACE)}/${encodeURIComponent(row.name)}`;

/**
 * Columns the definition asked for, not columns this app chose: `additionalPrinterColumns` is what
 * `kubectl get` prints for the kind, so a screen showing anything else would be a second opinion
 * about a kind the app has never seen.
 */
function columnsFor(crd: string, declared: CustomColumn[]): ColumnDef<CustomResourceRow>[] {
    return [
        nameColumn<CustomResourceRow>({ href: (row) => detailPath(crd, row) }),
        ...declared.map((column) => ({
            id: column.jsonPath,
            header: column.name,
            accessorFn: (row: CustomResourceRow) => row.cells[column.jsonPath] ?? '',
            cell: ({ row }: { row: { original: CustomResourceRow } }) => (
                <span className="text-text-2">{row.original.cells[column.jsonPath] ?? '—'}</span>
            ),
        })),
        ageColumn<CustomResourceRow>(),
    ];
}

function InstancesPage() {
    const { crd } = Route.useParams();
    const refetchInterval = useRefreshIntervalMs();
    // Two views of one read: the rows the list renders, and what the definition says about them.
    // Both carry the same query key, so the read itself happens once.
    const query = useIpcQuery('customResources.list', { crd }, { refetchInterval, select: (data) => data.items });
    const shape = useIpcQuery(
        'customResources.list',
        { crd },
        { select: (data) => ({ kind: data.kind, namespaced: data.namespaced, columns: data.columns }) },
    );
    const declared = shape.data?.columns;
    const columns = useMemo(() => columnsFor(crd, declared ?? []), [crd, declared]);

    return (
        <ResourceListPage
            icon={CodeIcon}
            title={shape.data?.kind ?? crd}
            nounPlural={shape.data?.kind ? `${shape.data.kind} objects` : 'objects'}
            columns={columns}
            query={query}
            clusterScoped={shape.data?.namespaced === false}
            detailPath={(row) => detailPath(crd, row)}
            rowProps={(row) => ({ 'data-instance': row.name })}
            testId="instances-table"
        />
    );
}
