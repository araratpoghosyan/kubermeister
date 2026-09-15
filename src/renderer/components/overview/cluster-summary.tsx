import type { Cluster } from '../../../shared/k8s/cluster';
import { CLUSTER_TONE } from '@/lib/status';
import { StatusBadge } from '@/components/data-display/status-badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ClusterSummary({ cluster }: { cluster: Cluster }) {
    const facts: Array<[string, string]> = [
        ['Nodes', String(cluster.nodes)],
        ['Kubernetes', cluster.version],
        ['Provider', cluster.provider],
        ['Region', cluster.region],
    ];
    return (
        <Card data-testid="cluster-summary">
            <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{cluster.name}</CardTitle>
                <StatusBadge tone={CLUSTER_TONE[cluster.status]}>{cluster.status}</StatusBadge>
            </CardHeader>
            <CardContent>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
                    {facts.map(([label, value]) => (
                        <div key={label}>
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="font-medium tabular-nums">{value}</dd>
                        </div>
                    ))}
                </dl>
            </CardContent>
        </Card>
    );
}
