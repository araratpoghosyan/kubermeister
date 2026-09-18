import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { CodeIcon } from 'lucide-react';
import type { CustomResource } from '../../../../shared/k8s/addons';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn, textColumn } from '@/components/templates/list-columns';
import { useWatchedList } from '@/lib/watch';

export const Route = createFileRoute('/addons/crds/')({ component: CrdsPage });

const detailPath = (crd: Pick<CustomResource, 'name'>) => `/addons/crds/${encodeURIComponent(crd.name)}`;

const columns: ColumnDef<CustomResource>[] = [
    nameColumn<CustomResource>({ mono: true, href: detailPath }),
    textColumn<CustomResource>('group', 'Group', { size: 200, mono: true }),
    textColumn<CustomResource>('version', 'Version', { size: 100, mono: true }),
    {
        id: 'scope',
        header: 'Scope',
        size: 120,
        accessorFn: (row) => row.scope,
        cell: ({ row }) => (
            <span className={row.original.scope === 'Cluster' ? 'text-primary' : 'text-text-2'}>
                {row.original.scope}
            </span>
        ),
    },
    textColumn<CustomResource>('kind', 'Kind', { size: 180 }),
    ageColumn<CustomResource>(),
];

function CrdsPage() {
    const crds = useWatchedList('CustomResourceDefinition');
    return (
        <ResourceListPage
            clusterScoped
            icon={CodeIcon}
            title="Custom Resource Definitions"
            nounPlural="CRDs"
            columns={columns}
            query={crds}
            detailPath={detailPath}
            rowProps={(crd) => ({ 'data-crd': crd.name })}
            testId="crds-table"
            footerNote={crds.live ? 'live' : undefined}
        />
    );
}
