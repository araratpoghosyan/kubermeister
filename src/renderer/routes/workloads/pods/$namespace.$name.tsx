import { createFileRoute, Link } from '@tanstack/react-router';
import { useResource } from '@/lib/resources';
import { LoadingRows, QueryError } from '@/components/overview/query-state';
import { PodDetail } from '@/components/workloads/pod-detail';

export const Route = createFileRoute('/workloads/pods/$namespace/$name')({ component: PodPage });

function PodPage() {
    const { namespace, name } = Route.useParams();
    const pod = useResource('Pod', name, namespace);
    return (
        <section className="space-y-4" data-testid="pod-page">
            <p className="text-sm">
                <Link to="/workloads/pods" className="text-muted-foreground hover:underline">
                    Pods
                </Link>
                <span className="text-muted-foreground"> / </span>
                <span className="font-medium">{name}</span>
            </p>
            {pod.isPending && <LoadingRows rows={4} />}
            {pod.isError && <QueryError error={pod.error} />}
            {pod.data === null && (
                <p className="text-sm text-muted-foreground" data-testid="not-found">
                    Pod {namespace}/{name} does not exist.
                </p>
            )}
            {pod.data && <PodDetail pod={pod.data} />}
        </section>
    );
}
