import { createFileRoute } from '@tanstack/react-router';
import { CpuIcon, HeartIcon, ListChecksIcon, ServerIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ComingSoonButton } from '@/components/coming-soon-button';
import { RefreshButton } from '@/components/refresh-button';
import { DetailCard, DetailMetrics, PropertyGrid } from '@/components/templates/detail-cards';
import { eventsTab, labelsTab, ResourceDetail, type DetailTabGroup } from '@/components/templates/resource-detail';
import { manifestTab } from '@/components/templates/manifest-panel';
import { EditResourceButton } from '@/components/templates/edit-resource-button';
import { DeleteResourceButton } from '@/components/templates/delete-resource-button';
import { ipcQueryKey, useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';
import { NODE_TONE } from '@/lib/status';

export const Route = createFileRoute('/overview/nodes_/$name')({ component: NodeDetailPage });

const last = (series: number[]) => series.at(-1);

function NodeDetailPage() {
    const { name } = Route.useParams();
    const refetchInterval = useRefreshIntervalMs();
    const query = useIpcQuery('nodes.get', { name }, { refetchInterval });
    const node = query.data;
    const series = useIpcQuery('metrics.nodeSeries', { name }, { refetchInterval }).data;
    const sparkCpu = series?.cpu ?? [];
    const sparkMem = series?.mem ?? [];
    const conditions = node?.conditions ?? [];

    const groups: DetailTabGroup[] = [
        {
            label: 'OBSERVE',
            items: [
                {
                    id: 'overview',
                    label: 'Overview',
                    icon: HeartIcon,
                    content: (
                        <DetailMetrics
                            metrics={[
                                {
                                    label: 'CPU',
                                    value: sparkCpu.length ? `${last(sparkCpu)}%` : '—',
                                    sub: `${node?.cpu ?? 0} cores`,
                                    spark: sparkCpu,
                                    sparkColor: 'var(--warn)',
                                },
                                {
                                    label: 'Memory',
                                    value: sparkMem.length ? `${last(sparkMem)}%` : '—',
                                    sub: `${node?.memory ?? 0} GiB`,
                                    spark: sparkMem,
                                    sparkColor: 'var(--danger)',
                                },
                                { label: 'Pods', value: `${node?.pods ?? 0}`, sub: 'running' },
                            ]}
                        />
                    ),
                },
                eventsTab({ kind: 'Node', name }),
            ],
        },
        {
            label: 'INSPECT',
            items: [
                manifestTab({ kind: 'Node', name }),
                labelsTab(node ? { labels: node.labels, annotations: node.annotations } : undefined),
                {
                    id: 'system',
                    label: 'System info',
                    icon: CpuIcon,
                    content: (
                        <DetailCard title="System info">
                            <div data-testid="system-info">
                                <PropertyGrid
                                    columns={3}
                                    rows={[
                                        ['OS image', node?.info.os ?? '—'],
                                        ['Kernel', node?.info.kernel ?? '—'],
                                        ['Container runtime', node?.info.containerRuntime ?? '—'],
                                        ['Kubelet', node?.info.kubeletVersion ?? '—'],
                                        ['Architecture', node?.info.architecture ?? '—'],
                                        ['Instance type', node?.instanceType ?? '—'],
                                    ]}
                                />
                            </div>
                        </DetailCard>
                    ),
                },
                {
                    id: 'conditions',
                    label: 'Conditions',
                    icon: ListChecksIcon,
                    count: conditions.length || undefined,
                    content: (
                        <DetailCard title="Conditions">
                            <div className="flex flex-wrap gap-2" data-testid="node-conditions">
                                {conditions.map((c) => (
                                    <Badge key={c.type} variant="neutral" className="rounded-sm">
                                        {c.type}: {c.status}
                                    </Badge>
                                ))}
                            </div>
                        </DetailCard>
                    ),
                },
            ],
        },
    ];

    return (
        <ResourceDetail
            icon={ServerIcon}
            eyebrow="Node"
            title={name}
            status={node ? { label: node.status, tone: NODE_TONE[node.status] } : undefined}
            meta={[
                `role: ${node?.role ?? '—'}`,
                `k8s ${node?.version ?? '—'}`,
                node?.instanceType ?? '—',
                `${node?.pods ?? 0} pods`,
            ]}
            actions={
                <>
                    <RefreshButton
                        queryKeys={[ipcQueryKey('nodes.get', { name }), ipcQueryKey('metrics.nodeSeries', { name })]}
                    />
                    <ComingSoonButton variant="outline" size="sm" tip="Cordoning arrives with node actions">
                        Cordon
                    </ComingSoonButton>
                    <ComingSoonButton variant="outline" size="sm" tip="Draining arrives with node actions">
                        Drain
                    </ComingSoonButton>
                    <EditResourceButton />
                    <DeleteResourceButton kind="Node" name={name} backTo="/overview/nodes" />
                </>
            }
            groups={groups}
            query={query}
            found={!!node}
            backTo="/overview/nodes"
            kind="Node"
            testId="node-page"
        />
    );
}
