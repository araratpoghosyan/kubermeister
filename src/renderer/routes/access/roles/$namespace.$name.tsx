import { createFileRoute } from '@tanstack/react-router';
import { ShieldIcon } from 'lucide-react';
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

export const Route = createFileRoute('/access/roles/$namespace/$name')({ component: RoleDetailPage });

function RoleDetailPage() {
    const { namespace, name } = Route.useParams();
    const query = useResource('Role', name, namespace);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Namespace', row.namespace],
                          ['Rules', String(row.rules)],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'Role', name, namespace }),
                  ],
              },
              { label: 'INSPECT', items: [labelsTab({ labels: row.labels, annotations: row.annotations })] },
          ]
        : [];

    return (
        <ResourceDetail
            icon={ShieldIcon}
            eyebrow="Role"
            title={name}
            kind="Role"
            namespace={namespace}
            backTo="/access/roles"
            query={query}
            found={!!row}
            actions={<RefreshButton queryKeys={[ipcQueryKey('resources.get', { kind: 'Role', name, namespace })]} />}
            meta={row ? [`namespace: ${row.namespace}`, `rules: ${row.rules}`] : undefined}
            groups={groups}
            testId="role-page"
        />
    );
}
