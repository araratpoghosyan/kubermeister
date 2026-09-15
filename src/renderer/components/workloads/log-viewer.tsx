import { useDeferredValue, useEffect, useRef, useState } from 'react';
import type { LogLine, LogLevel } from '../../../shared/k8s/logs';
import type { LogStreamState } from '@/lib/pod-streams';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export const SINCE_OPTIONS = [
    { label: 'Tail', seconds: undefined },
    { label: '5 min', seconds: 300 },
    { label: '1 hour', seconds: 3_600 },
    { label: '24 hours', seconds: 86_400 },
] as const;

const LEVEL_CLASS: Record<LogLevel, string> = {
    ERROR: 'text-red-500',
    WARN: 'text-amber-500',
    DEBUG: 'text-muted-foreground',
    INFO: 'text-foreground',
};

/** Case-insensitive substring filter over the message text. */
export function filterLines(lines: LogLine[], query: string): LogLine[] {
    const needle = query.trim().toLowerCase();
    return needle ? lines.filter((line) => line.message.toLowerCase().includes(needle)) : lines;
}

export function LogViewer({
    state,
    containers,
    container,
    onContainerChange,
    since,
    onSinceChange,
}: {
    state: LogStreamState;
    containers: string[];
    container: string;
    onContainerChange: (name: string) => void;
    since: (typeof SINCE_OPTIONS)[number];
    onSinceChange: (option: (typeof SINCE_OPTIONS)[number]) => void;
}) {
    const [query, setQuery] = useState('');
    const deferred = useDeferredValue(query);
    const lines = filterLines(state.lines, deferred);
    const bottom = useRef<HTMLDivElement>(null);

    // Follow the tail unless the user is filtering, which usually means they are reading.
    useEffect(() => {
        if (!deferred) bottom.current?.scrollIntoView({ block: 'end' });
    }, [lines.length, deferred]);

    return (
        <div
            className="flex h-[60vh] min-h-0 flex-col rounded-md border"
            data-testid="log-viewer"
            data-live={String(state.live)}
        >
            <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
                <Select value={container} onValueChange={onContainerChange} disabled={containers.length < 2}>
                    <SelectTrigger className="h-8 w-44" aria-label="Container">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {containers.map((name) => (
                            <SelectItem key={name} value={name}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Select
                    value={since.label}
                    onValueChange={(label) =>
                        onSinceChange(SINCE_OPTIONS.find((o) => o.label === label) ?? SINCE_OPTIONS[0])
                    }
                >
                    <SelectTrigger className="h-8 w-32" aria-label="Since">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {SINCE_OPTIONS.map((option) => (
                            <SelectItem key={option.label} value={option.label}>
                                {option.label}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <Input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Filter…"
                    aria-label="Filter log lines"
                    className="h-8 w-56"
                />
                <span className="ml-auto text-xs text-muted-foreground" data-testid="log-status">
                    {state.error
                        ? `Error: ${state.error}`
                        : state.ended
                          ? 'Stream ended'
                          : state.live
                            ? 'Live'
                            : 'Connecting…'}
                    {` · ${lines.length} line${lines.length === 1 ? '' : 's'}`}
                </span>
            </div>
            <ol className="min-h-0 flex-1 overflow-auto p-3 font-mono text-xs leading-5" aria-label="Log lines">
                {lines.map((line, index) => (
                    <li
                        key={`${line.timestamp}-${index}`}
                        className={cn('whitespace-pre-wrap break-all', LEVEL_CLASS[line.level])}
                    >
                        {line.timestamp && <span className="mr-2 text-muted-foreground">{line.timestamp}</span>}
                        {line.message}
                    </li>
                ))}
                <div ref={bottom} />
            </ol>
        </div>
    );
}
