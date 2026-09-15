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

export const Route = createFileRoute('/network/networkpolicies/$namespace/$name')({
    component: NetworkPolicyDetailPage,
});

function NetworkPolicyDetailPage() {
    const { namespace, name } = Route.useParams();
    const query = useResource('NetworkPolicy', name, namespace);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Pod selector', row.podSelector],
                          ['Policy types', row.policyTypes],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'NetworkPolicy', name, namespace }),
                  ],
              },
              { label: 'INSPECT', items: [labelsTab({ labels: row.labels, annotations: row.annotations })] },
          ]
        : [];

    return (
        <ResourceDetail
            icon={ShieldIcon}
            eyebrow="NetworkPolicy"
            title={name}
            kind="NetworkPolicy"
            namespace={namespace}
            backTo="/network/networkpolicies"
            query={query}
            found={!!row}
            actions={
                <RefreshButton queryKeys={[ipcQueryKey('resources.get', { kind: 'NetworkPolicy', name, namespace })]} />
            }
            meta={row ? [`namespace: ${row.namespace}`, `selector: ${row.podSelector}`] : undefined}
            groups={groups}
            testId="networkpolicy-page"
        />
    );
}
