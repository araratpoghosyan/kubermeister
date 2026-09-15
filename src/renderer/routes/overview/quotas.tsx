import { createFileRoute } from '@tanstack/react-router';
import type { ColumnDef } from '@tanstack/react-table';
import { LayersIcon } from 'lucide-react';
import type { ResourceQuota } from '../../../shared/k8s/overview';
import { ResourceListPage } from '@/components/templates/resource-list-page';
import { meterColumn, textColumn } from '@/components/templates/list-columns';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';

export const Route = createFileRoute('/overview/quotas')({ component: QuotasPage });

const columns: ColumnDef<ResourceQuota>[] = [
    {
        id: 'namespace',
        header: 'Namespace',
        accessorFn: (row) => row.namespace,
        cell: ({ row }) => <span className="font-medium text-primary">{row.original.namespace}</span>,
    },
    textColumn<ResourceQuota>('name', 'Quota', { size: 160 }),
    textColumn<ResourceQuota>('resource', 'Resource', { size: 180, mono: true, small: true }),
    textColumn<ResourceQuota>('used', 'Used', { size: 110, mono: true, numeric: true }),
    textColumn<ResourceQuota>('hard', 'Hard limit', { size: 110, mono: true, muted: true, numeric: true }),
    textColumn<ResourceQuota>('remaining', 'Remaining', { size: 110, mono: true, muted: true, numeric: true }),
    meterColumn<ResourceQuota>('usage', 'Usage', (quota) => quota.usage, { size: 160 }),
];

function QuotasPage() {
    const quotas = useIpcQuery('quotas.list', {}, { refetchInterval: useRefreshIntervalMs() });
    return (
        <ResourceListPage
            icon={LayersIcon}
            title="Resource quotas"
            nounPlural="quotas"
            columns={columns}
            query={quotas}
            footerNote="grouped by namespace"
            testId="quotas-table"
        />
    );
}
