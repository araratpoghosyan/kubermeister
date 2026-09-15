import { useState } from 'react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { usePodLogStream } from '@/lib/pod-streams';
import { LogViewer, SINCE_OPTIONS } from './log-viewer';

export function PodLogsTab({ pod }: { pod: PodDetail }) {
    const containers = pod.containers.map((c) => c.name);
    const [selected, setSelected] = useState<string | null>(null);
    const [since, setSince] = useState<(typeof SINCE_OPTIONS)[number]>(SINCE_OPTIONS[0]);
    const container = selected && containers.includes(selected) ? selected : containers[0];
    const state = usePodLogStream(
        container ? { name: pod.name, namespace: pod.namespace, container, sinceSeconds: since.seconds } : null,
    );
    if (!container) return <p className="text-sm text-muted-foreground">This pod has no containers.</p>;
    return (
        <LogViewer
            state={state}
            containers={containers}
            container={container}
            onContainerChange={setSelected}
            since={since}
            onSinceChange={setSince}
        />
    );
}
