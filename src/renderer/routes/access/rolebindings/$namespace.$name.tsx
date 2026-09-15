import { createFileRoute } from '@tanstack/react-router';
import { ShieldCheckIcon } from 'lucide-react';
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

export const Route = createFileRoute('/access/rolebindings/$namespace/$name')({ component: RoleBindingDetailPage });

function RoleBindingDetailPage() {
    const { namespace, name } = Route.useParams();
    const query = useResource('RoleBinding', name, namespace);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Role', row.role],
                          ['Subjects', String(row.subjects)],
                          ['Namespace', row.namespace],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'RoleBinding', name, namespace }),
                  ],
              },
              { label: 'INSPECT', items: [labelsTab({ labels: row.labels, annotations: row.annotations })] },
          ]
        : [];

    return (
        <ResourceDetail
            icon={ShieldCheckIcon}
            eyebrow="RoleBinding"
            title={name}
            kind="RoleBinding"
            namespace={namespace}
            backTo="/access/rolebindings"
            query={query}
            found={!!row}
            actions={
                <RefreshButton queryKeys={[ipcQueryKey('resources.get', { kind: 'RoleBinding', name, namespace })]} />
            }
            meta={row ? [`namespace: ${row.namespace}`, `role: ${row.role}`] : undefined}
            groups={groups}
            testId="rolebinding-page"
        />
    );
}
