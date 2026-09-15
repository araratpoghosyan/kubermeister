import { createFileRoute } from '@tanstack/react-router';
import { useResourceList } from '@/lib/resources';
import { LoadingRows, QueryError } from '@/components/overview/query-state';
import { PodsTable } from '@/components/workloads/pods-table';

export const Route = createFileRoute('/workloads/pods/')({ component: PodsPage });

function PodsPage() {
    const pods = useResourceList('Pod');
    return (
        <section className="space-y-4" data-testid="pods-page">
            <h1 className="text-lg font-semibold">Pods</h1>
            {pods.isPending && <LoadingRows />}
            {pods.isError && <QueryError error={pods.error} />}
            {pods.data && <PodsTable pods={pods.data} />}
        </section>
    );
}
