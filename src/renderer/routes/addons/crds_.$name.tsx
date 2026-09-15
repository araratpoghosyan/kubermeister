import { createFileRoute } from '@tanstack/react-router';
import { CodeIcon } from 'lucide-react';
import { RefreshButton } from '@/components/refresh-button';
import {
    eventsTab,
    labelsTab,
    overviewTab,
    ResourceDetail,
    type DetailTabGroup,
} from '@/components/templates/resource-detail';
import { manifestTab } from '@/components/templates/manifest-panel';
import { ipcQueryKey } from '@/lib/query';
import { useResource } from '@/lib/resources';

export const Route = createFileRoute('/addons/crds_/$name')({ component: CustomResourceDetailPage });

function CustomResourceDetailPage() {
    const { name } = Route.useParams();
    const query = useResource('CustomResourceDefinition', name);
    const row = query.data;

    const groups: DetailTabGroup[] = row
        ? [
              {
                  label: 'OBSERVE',
                  items: [
                      overviewTab([
                          ['Group', row.group],
                          ['Version', row.version],
                          ['Scope', row.scope],
                          ['Kind', row.kind],
                          ['Age', row.age],
                      ]),
                      eventsTab({ kind: 'CustomResourceDefinition', name }),
                  ],
              },
              {
                  label: 'INSPECT',
                  items: [
                      manifestTab({ kind: 'CustomResourceDefinition', name }),
                      labelsTab({ labels: row.labels, annotations: row.annotations }),
                  ],
              },
          ]
        : [];

    return (
        <ResourceDetail
            icon={CodeIcon}
            eyebrow="CRD"
            title={name}
            kind="CustomResourceDefinition"
            backTo="/addons/crds"
            query={query}
            found={!!row}
            actions={
                <RefreshButton queryKeys={[ipcQueryKey('resources.get', { kind: 'CustomResourceDefinition', name })]} />
            }
            meta={row ? [`group: ${row.group}`, `kind: ${row.kind}`] : undefined}
            groups={groups}
            testId="crd-page"
        />
    );
}
