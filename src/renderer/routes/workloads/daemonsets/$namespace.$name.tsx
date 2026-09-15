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
import { ipcQueryKey } from '@/lib/query';
import { useResource } from '@/lib/resources';

export const Route = createFileRoute('/workloads/daemonsets/$namespace/$name')({ component: DaemonSetDetailPage });

function DaemonSetDetailPage() {
    const { namespace, name } = Route.useParams();
    const query = useResource('DaemonSet', name, namespace);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Desired', String(row.desired)],
                          ['Current', String(row.current)],
                          ['Ready', String(row.ready)],
                          ['Up to date', String(row.upToDate)],
                          ['Node selector', row.nodeSelector],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'DaemonSet', name, namespace }),
                  ],
              },
              { label: 'INSPECT', items: [labelsTab({ labels: row.labels, annotations: row.annotations })] },
          ]
        : [];

    return (
        <ResourceDetail
            icon={BoxesIcon}
            eyebrow="DaemonSet"
            title={name}
            kind="DaemonSet"
            namespace={namespace}
            backTo="/workloads/daemonsets"
            query={query}
            found={!!row}
            actions={
                <RefreshButton queryKeys={[ipcQueryKey('resources.get', { kind: 'DaemonSet', name, namespace })]} />
            }
            meta={row ? [`desired: ${row.desired}`, `ready: ${row.ready}`] : undefined}
            groups={groups}
            testId="daemonset-page"
        />
    );
}
