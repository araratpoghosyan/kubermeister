import { createFileRoute } from '@tanstack/react-router';
import { GaugeIcon } from 'lucide-react';
import { StatusBadge } from '@/components/data-display/status-badge';
import { LoadingRows, QueryError } from '@/components/overview/query-state';
import { DetailCard, DetailMetrics, PropertyGrid } from '@/components/templates/detail-cards';
import { DetailHeader } from '@/components/templates/detail-header';
import { useIpcQuery } from '@/lib/query';
import { CLUSTER_TONE } from '@/lib/status';

export const Route = createFileRoute('/overview/summary')({ component: SummaryPage });

function SummaryPage() {
    const cluster = useIpcQuery('cluster.active', {}, { refetchInterval: 15_000 });
    const nodes = useIpcQuery('nodes.list', {}, { refetchInterval: 15_000 });
    const namespaces = useIpcQuery('namespaces.list', {}, { refetchInterval: 15_000 });
    const pods = namespaces.data?.reduce((sum, ns) => sum + ns.pods, 0);

    return (
        <div className="flex h-full flex-col overflow-auto" data-testid="summary-page">
            {cluster.isPending && <LoadingRows rows={3} />}
            {cluster.isError && (
                <div className="p-4.5">
                    <QueryError error={cluster.error} />
                </div>
            )}
            {cluster.data === null && <p className="p-4.5 text-body text-text-muted">No current context.</p>}
            {cluster.data && (
                <div data-testid="cluster-summary">
                    <DetailHeader
                        icon={GaugeIcon}
                        eyebrow="Cluster"
                        title={cluster.data.name}
                        status={{ label: cluster.data.status, tone: CLUSTER_TONE[cluster.data.status] }}
                        meta={[`Kubernetes ${cluster.data.version}`, cluster.data.provider, cluster.data.region]}
                    />
                    <div className="space-y-4 px-4.5 pb-4.5">
                        <DetailMetrics
                            metrics={[
                                { label: 'Nodes', value: String(cluster.data.nodes) },
                                { label: 'Namespaces', value: namespaces.data ? String(namespaces.data.length) : '—' },
                                { label: 'Pods', value: pods === undefined ? '—' : String(pods) },
                                { label: 'Version', value: cluster.data.version },
                            ]}
                        />
                        <div className="grid gap-4 lg:grid-cols-2">
                            <DetailCard title="Cluster" desc="Facts from the active context">
                                <PropertyGrid
                                    columns={1}
                                    rows={[
                                        ['Context', cluster.data.name],
                                        ['Provider', cluster.data.provider],
                                        ['Region', cluster.data.region],
                                        ['Kubernetes', cluster.data.version],
                                    ]}
                                />
                            </DetailCard>
                            <DetailCard title="Nodes" desc="Readiness per node">
                                {nodes.data ? (
                                    <ul className="space-y-1.5 text-cell">
                                        {nodes.data.map((node) => (
                                            <li key={node.name} className="flex items-center justify-between gap-3">
                                                <span className="truncate font-mono text-text-2">{node.name}</span>
                                                <StatusBadge
                                                    tone={
                                                        node.status === 'Ready'
                                                            ? 'ok'
                                                            : node.status === 'Cordoned'
                                                              ? 'warn'
                                                              : 'danger'
                                                    }
                                                >
                                                    {node.status}
                                                </StatusBadge>
                                            </li>
                                        ))}
                                    </ul>
                                ) : (
                                    <LoadingRows rows={2} />
                                )}
                            </DetailCard>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
