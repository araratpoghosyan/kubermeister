import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { HardDriveIcon } from 'lucide-react';
import type { Claim } from '../../../../shared/k8s/storage';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { ageColumn, nameColumn, statusColumn, textColumn } from '@/components/templates/list-columns';
import { CLAIM_TONE } from '@/lib/status';
import { useFilteredList } from '@/components/list/use-filtered-list';

export const Route = createFileRoute('/storage/claims/')({ component: ClaimsPage });

const detailPath = (claim: Pick<Claim, 'namespace' | 'name'>) =>
    `/storage/claims/${encodeURIComponent(claim.namespace)}/${encodeURIComponent(claim.name)}`;

const columns: ColumnDef<Claim>[] = [
    nameColumn<Claim>({ href: detailPath }),
    statusColumn<Claim, Claim['status']>(CLAIM_TONE),
    textColumn<Claim>('volume', 'Volume', { size: 220, mono: true }),
    textColumn<Claim>('capacity', 'Capacity', { size: 90, mono: true, numeric: true }),
    textColumn<Claim>('accessModes', 'Access modes', { size: 110, mono: true }),
    textColumn<Claim>('storageClass', 'Storage class', { size: 150 }),
    ageColumn<Claim>(),
];

function ClaimsPage() {
    const claims = useFilteredList('PersistentVolumeClaim');
    return (
        <ResourceListPage
            icon={HardDriveIcon}
            title="Claims"
            columns={columns}
            query={claims}
            toolbar={claims.filter}
            detailPath={detailPath}
            rowProps={(claim) => ({ 'data-claim': claim.name })}
            bulkDelete={{ kind: 'PersistentVolumeClaim' }}
            testId="claims-table"
            footerNote={claims.live ? 'live' : undefined}
        />
    );
}
