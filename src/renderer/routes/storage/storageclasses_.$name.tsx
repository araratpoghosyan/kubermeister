import { createFileRoute } from '@tanstack/react-router';
import { LayersIcon } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import {
    eventsTab,
    labelsTab,
    overviewTab,
    ResourceDetail,
    type DetailTabGroup,
} from '@/components/templates/resource-detail';
import { ipcQueryKey } from '@/lib/query';
import { useResource } from '@/lib/resources';

export const Route = createFileRoute('/storage/storageclasses_/$name')({ component: StorageClassDetailPage });

function StorageClassDetailPage() {
    const { name } = Route.useParams();
    const query = useResource('StorageClass', name);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Provisioner', row.provisioner],
                          ['Reclaim policy', row.reclaimPolicy],
                          ['Volume binding', row.volumeBinding],
                          ['Default class', String(row.isDefault)],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'StorageClass', name }),
                  ],
              },
              { label: 'INSPECT', items: [labelsTab({ labels: row.labels, annotations: row.annotations })] },
          ]
        : [];

    return (
        <ResourceDetail
            icon={LayersIcon}
            eyebrow="StorageClass"
            title={name}
            kind="StorageClass"
            backTo="/storage/storageclasses"
            query={query}
            found={!!row}
            actions={<RefreshButton queryKeys={[ipcQueryKey('resources.get', { kind: 'StorageClass', name })]} />}
            meta={row ? [`provisioner: ${row.provisioner}`, `binding: ${row.volumeBinding}`] : undefined}
            groups={groups}
            testId="storageclass-page"
        />
    );
}
