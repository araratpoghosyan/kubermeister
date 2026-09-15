import { createFileRoute, Link } from '@tanstack/react-router';
import { useResource } from '@/lib/resources';
import { LoadingRows, QueryError } from '@/components/overview/query-state';
import { PodDetail } from '@/components/workloads/pod-detail';
import { PodLogsTab } from '@/components/workloads/pod-logs-tab';
import { PodShellTab } from '@/components/workloads/pod-shell-tab';
import { PortForwardControl } from '@/components/workloads/port-forward-control';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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
            {pod.data && (
                <Tabs defaultValue="overview">
                    <TabsList>
                        <TabsTrigger value="overview">Overview</TabsTrigger>
                        <TabsTrigger value="logs">Logs</TabsTrigger>
                        <TabsTrigger value="shell">Shell</TabsTrigger>
                        <TabsTrigger value="network">Network</TabsTrigger>
                    </TabsList>
                    <TabsContent value="overview">
                        <PodDetail pod={pod.data} />
                    </TabsContent>
                    <TabsContent value="logs">
                        <PodLogsTab pod={pod.data} />
                    </TabsContent>
                    <TabsContent value="shell">
                        <PodShellTab pod={pod.data} />
                    </TabsContent>
                    <TabsContent value="network">
                        <PortForwardControl pod={pod.data} />
                    </TabsContent>
                </Tabs>
            )}
        </section>
    );
}
