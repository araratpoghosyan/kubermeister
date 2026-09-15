import { createFileRoute } from '@tanstack/react-router';
import { useIpcQuery } from '@/lib/query';
import { NodesTable } from '@/components/overview/nodes-table';
import { LoadingRows, QueryError } from '@/components/overview/query-state';

export const Route = createFileRoute('/overview/nodes')({ component: NodesPage });

function NodesPage() {
    const nodes = useIpcQuery('nodes.list', {}, { refetchInterval: 15_000 });
    return (
        <section className="space-y-4" data-testid="nodes-page">
            <h1 className="text-lg font-semibold">Nodes</h1>
            {nodes.isPending && <LoadingRows />}
            {nodes.isError && <QueryError error={nodes.error} />}
            {nodes.data && <NodesTable nodes={nodes.data} />}
        </section>
    );
}
