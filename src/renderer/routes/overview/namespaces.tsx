import { createFileRoute } from '@tanstack/react-router';
import { useIpcQuery } from '@/lib/query';
import { NamespacesTable } from '@/components/overview/namespaces-table';
import { LoadingRows, QueryError } from '@/components/overview/query-state';

export const Route = createFileRoute('/overview/namespaces')({ component: NamespacesPage });

function NamespacesPage() {
    const namespaces = useIpcQuery('namespaces.list', {}, { refetchInterval: 15_000 });
    return (
        <section className="space-y-4" data-testid="namespaces-page">
            <h1 className="text-lg font-semibold">Namespaces</h1>
            {namespaces.isPending && <LoadingRows />}
            {namespaces.isError && <QueryError error={namespaces.error} />}
            {namespaces.data && <NamespacesTable namespaces={namespaces.data} />}
        </section>
    );
}
