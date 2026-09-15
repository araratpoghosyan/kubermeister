import { createFileRoute } from '@tanstack/react-router';
import { useIpcQuery } from '@/lib/query';
import { ClusterSummary } from '@/components/overview/cluster-summary';
import { LoadingRows, QueryError } from '@/components/overview/query-state';

export const Route = createFileRoute('/overview/summary')({ component: SummaryPage });

function SummaryPage() {
    const cluster = useIpcQuery('cluster.active', {}, { refetchInterval: 15_000 });
    return (
        <section className="space-y-4" data-testid="summary-page">
            <h1 className="text-lg font-semibold">Summary</h1>
            {cluster.isPending && <LoadingRows rows={2} />}
            {cluster.isError && <QueryError error={cluster.error} />}
            {cluster.data === null && <p className="text-sm text-muted-foreground">No current context.</p>}
            {cluster.data && <ClusterSummary cluster={cluster.data} />}
        </section>
    );
}
