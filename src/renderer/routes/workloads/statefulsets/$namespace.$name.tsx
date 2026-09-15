import { createFileRoute } from '@tanstack/react-router';
import { BoxesIcon } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import {
    eventsTab,
    labelsTab,
    overviewTab,
    ResourceDetail,
    type DetailTabGroup,
} from '@/components/templates/resource-detail';
import { manifestTab } from '@/components/templates/manifest-panel';
import { EditResourceButton } from '@/components/templates/edit-resource-button';
import { DeleteResourceButton } from '@/components/templates/delete-resource-button';
import { ipcQueryKey } from '@/lib/query';
import { useResource } from '@/lib/resources';

export const Route = createFileRoute('/workloads/statefulsets/$namespace/$name')({ component: StatefulSetDetailPage });

function StatefulSetDetailPage() {
    const { namespace, name } = Route.useParams();
    const query = useResource('StatefulSet', name, namespace);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Ready', row.ready],
                          ['Service', row.service],
                          ['Image', row.image],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'StatefulSet', name, namespace }),
                  ],
              },
              {
                  label: 'INSPECT',
                  items: [
                      manifestTab({ kind: 'StatefulSet', name, namespace }),
                      labelsTab({ labels: row.labels, annotations: row.annotations }),
                  ],
              },
          ]
        : [];

    return (
        <ResourceDetail
            icon={BoxesIcon}
            eyebrow="StatefulSet"
            title={name}
            kind="StatefulSet"
            namespace={namespace}
            backTo="/workloads/statefulsets"
            query={query}
            found={!!row}
            actions={
                <>
                    <RefreshButton
                        queryKeys={[ipcQueryKey('resources.get', { kind: 'StatefulSet', name, namespace })]}
                    />
                    <EditResourceButton />
                    <DeleteResourceButton
                        kind="StatefulSet"
                        name={name}
                        namespace={namespace}
                        backTo="/workloads/statefulsets"
                    />
                </>
            }
            meta={row ? [`ready: ${row.ready}`, `service: ${row.service}`] : undefined}
            groups={groups}
            testId="statefulset-page"
        />
    );
}
