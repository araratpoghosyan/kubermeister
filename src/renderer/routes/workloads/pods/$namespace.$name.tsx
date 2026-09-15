import { createFileRoute } from '@tanstack/react-router';
import { LayersIcon } from 'lucide-react';
import { DetailHeader } from '@/components/templates/detail-header';
import { POD_TONE } from '@/lib/status';
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
        <section className="flex h-full flex-col overflow-auto" data-testid="pod-page">
            {pod.isPending && (
                <div className="p-4.5">
                    <LoadingRows rows={4} />
                </div>
            )}
            {pod.isError && (
                <div className="p-4.5">
                    <QueryError error={pod.error} />
                </div>
            )}
            {pod.data === null && (
                <p className="p-4.5 text-body text-text-muted" data-testid="not-found">
                    Pod {namespace}/{name} does not exist.
                </p>
            )}
            {pod.data && (
                <>
                    <DetailHeader
                        icon={LayersIcon}
                        eyebrow="Pod"
                        title={pod.data.name}
                        status={{ label: pod.data.status, tone: POD_TONE[pod.data.status] }}
                        meta={[pod.data.namespace, pod.data.node, `${pod.data.ready} ready`, pod.data.age]}
                    />
                    <Tabs defaultValue="overview" className="px-4.5 pb-4.5">
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
                </>
            )}
        </section>
    );
}
