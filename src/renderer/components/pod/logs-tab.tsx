import { useDeferredValue, useState } from 'react';
import { toast } from 'sonner';
import type { LogLevel } from '../../../shared/k8s/logs';
import type { PodDetail } from '../../../shared/k8s/pods';
import { LogViewer, SINCE_OPTIONS, TAIL_OPTIONS, type SinceOption } from '@/components/data-display/log-viewer';
import { downloadTextFile } from '@/lib/download';
import { invoke } from '@/lib/ipc';
import { isBrokenPattern, visibleLines, NO_SEARCH, type LogSearch } from '@/lib/log-filter';
import { usePodLogStream } from '@/lib/pod-streams';
import { useIpcQuery } from '@/lib/query';

/** Pod logs tab: a snapshot of the selected container when idle, a live tail of it when Live is on. */
export function LogsTab({ name, namespace, pod }: { name: string; namespace: string; pod?: PodDetail | null }) {
    const containers = pod?.containers.map((c) => c.name) ?? [];
    const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
    const [since, setSince] = useState<SinceOption>(SINCE_OPTIONS[0]!);
    const [live, setLive] = useState(false);
    const [search, setSearch] = useState<LogSearch>(NO_SEARCH);
    const [minLevel, setMinLevel] = useState<LogLevel | null>(null);
    const [tailLines, setTailLines] = useState<number>(TAIL_OPTIONS[1]);
    const [timestamps, setTimestamps] = useState(true);
    const [wrap, setWrap] = useState(false);
    const [previous, setPrevious] = useState(false);
    const container = selectedContainer && containers.includes(selectedContainer) ? selectedContainer : containers[0];

    const target = container
        ? { name, namespace, container, sinceSeconds: since.seconds, tailLines, previous: previous || undefined }
        : null;
    const snapshot = useIpcQuery('pods.logSnapshot', target ?? { name, namespace }, { enabled: !live && !!target });
    const stream = usePodLogStream(live ? target : null);

    const source = live ? stream.lines : (snapshot.data ?? []);
    // Defer the search over the (up to 2,000-line) buffer so keystrokes stay responsive.
    const deferred = useDeferredValue(search);
    const lines = visibleLines(source, deferred, minLevel);

    /**
     * The whole log from the API server, not the buffer on screen: what is downloaded is the
     * container's log, capped in main, rather than the tail this view happens to be showing.
     */
    const download = async () => {
        if (!container) return;
        const whole = await invoke('pods.logDownload', {
            name,
            namespace,
            container,
            sinceSeconds: since.seconds,
            previous: previous || undefined,
        }).catch(() => null);
        if (!whole) return;
        downloadTextFile(`${name}-${container}${previous ? '-previous' : ''}.log`, whole.text);
        if (whole.truncated) {
            toast.success('Log downloaded', { description: 'It was long, so the oldest lines were left behind.' });
        }
    };

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
            search={search}
            onSearchChange={setSearch}
            minLevel={minLevel}
            onMinLevelChange={setMinLevel}
            tailLines={tailLines}
            onTailLinesChange={setTailLines}
            timestamps={timestamps}
            onTimestampsToggle={() => setTimestamps((v) => !v)}
            wrap={wrap}
            onWrapToggle={() => setWrap((v) => !v)}
            previous={previous}
            onPreviousToggle={() => setPrevious((v) => !v)}
            onDownload={() => void download()}
            error={live ? stream.error : snapshot.error ? snapshot.error.message : null}
            filtered={lines.length !== source.length}
            brokenPattern={isBrokenPattern(search)}
        />
    );
}
