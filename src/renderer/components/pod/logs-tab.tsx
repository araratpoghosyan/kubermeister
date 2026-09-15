import { useDeferredValue, useState } from 'react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { LogViewer, SINCE_OPTIONS, filterLines, type SinceOption } from '@/components/data-display/log-viewer';
import { downloadTextFile } from '@/lib/download';
import { usePodLogStream } from '@/lib/pod-streams';
import { useIpcQuery } from '@/lib/query';

/** Pod logs tab: a snapshot of the selected container when idle, a live tail of it when Live is on. */
export function LogsTab({ name, namespace, pod }: { name: string; namespace: string; pod?: PodDetail | null }) {
    const containers = pod?.containers.map((c) => c.name) ?? [];
    const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
    const [since, setSince] = useState<SinceOption>(SINCE_OPTIONS[0]!);
    const [live, setLive] = useState(false);
    const [grep, setGrep] = useState('');
    const container = selectedContainer && containers.includes(selectedContainer) ? selectedContainer : containers[0];

    const target = container ? { name, namespace, container, sinceSeconds: since.seconds } : null;
    const snapshot = useIpcQuery('pods.logSnapshot', target ?? { name, namespace }, { enabled: !live && !!target });
    const stream = usePodLogStream(live ? target : null);

    const source = live ? stream.lines : (snapshot.data ?? []);
    // Defer the grep filter over the (up to 2,000-line) buffer so keystrokes stay responsive.
    const query = useDeferredValue(grep).trim().toLowerCase();
    const lines = filterLines(source, query);

    const download = () =>
        downloadTextFile(`${name}.log`, lines.map((l) => `${l.timestamp} ${l.level} ${l.message}`).join('\n'));

    return (
        <LogViewer
            lines={lines}
            containers={containers}
            container={container}
            onContainerChange={setSelectedContainer}
            since={since}
            onSinceChange={setSince}
            live={live}
            onLiveToggle={() => setLive((v) => !v)}
            grep={grep}
            onGrepChange={setGrep}
            onDownload={download}
            error={live ? stream.error : snapshot.error ? snapshot.error.message : null}
            filtered={!!query}
        />
    );
}
