import { ChevronDownIcon, DownloadIcon, SearchIcon } from 'lucide-react';
import type { LogLine } from '../../../shared/k8s/logs';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

export interface SinceOption {
    label: string;
    seconds?: number;
}

export const SINCE_OPTIONS: SinceOption[] = [
    { label: '5 minutes', seconds: 300 },
    { label: '15 minutes', seconds: 900 },
    { label: '1 hour', seconds: 3600 },
    { label: 'All logs', seconds: undefined },
];

export const LOG_LEVEL_COLOR: Record<LogLine['level'], string> = {
    ERROR: 'text-danger',
    WARN: 'text-warn',
    DEBUG: 'text-text-dim',
    INFO: 'text-ok',
};

/** Case-insensitive substring filter over the message text. */
export function filterLines<T extends LogLine>(lines: T[], query: string): T[] {
    const needle = query.trim().toLowerCase();
    return needle ? lines.filter((line) => line.message.toLowerCase().includes(needle)) : lines;
}

interface LogViewerProps {
    lines: LogLine[];
    containers: string[];
    container?: string;
    onContainerChange: (container: string) => void;
    since: SinceOption;
    onSinceChange: (since: SinceOption) => void;
    live: boolean;
    onLiveToggle: () => void;
    grep: string;
    onGrepChange: (grep: string) => void;
    onDownload: () => void;
    /** Rendered above the rows when the live stream errors. */
    error?: string | null;
    /** True when `lines` has been narrowed by the grep filter. */
    filtered?: boolean;
}

/**
 * Presentational log console: container and since pickers, grep, a Live toggle, and the rendered
 * lines. State and the log source (snapshot or live stream) are owned by the caller.
 */
export function LogViewer({
    lines,
    containers,
    container,
    onContainerChange,
    since,
    onSinceChange,
    live,
    onLiveToggle,
    grep,
    onGrepChange,
    onDownload,
    error,
    filtered,
}: LogViewerProps) {
    return (
        <Card
            className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-card py-0 shadow-none"
            data-testid="log-viewer"
            data-live={String(live)}
        >
            <div className="flex items-center gap-2.5 border-b border-border px-3.5 py-2">
                <span className="text-meta text-text-muted">Container</span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="xs" disabled={containers.length === 0} aria-label="Container">
                            {container ?? '—'}
                            <ChevronDownIcon />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {containers.map((c) => (
                            <DropdownMenuItem key={c} onSelect={() => onContainerChange(c)}>
                                {c}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <span className="ml-2 text-meta text-text-muted">Since</span>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="xs" aria-label="Since">
                            {since.label}
                            <ChevronDownIcon />
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                        {SINCE_OPTIONS.map((option) => (
                            <DropdownMenuItem key={option.label} onSelect={() => onSinceChange(option)}>
                                {option.label}
                            </DropdownMenuItem>
                        ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <div className="flex-1" />
                <div className="relative w-[200px]">
                    <SearchIcon className="absolute top-1/2 left-2.5 size-3 -translate-y-1/2 text-text-dim" />
                    <Input
                        value={grep}
                        onChange={(e) => onGrepChange(e.target.value)}
                        placeholder="grep…"
                        aria-label="Filter log lines"
                        className="h-7 pl-7 text-cell"
                    />
                </div>
                <Button variant={live ? 'default' : 'outline'} size="xs" onClick={onLiveToggle} aria-pressed={live}>
                    <span className={cn('size-1.5 rounded-full', live ? 'animate-pulse bg-ok' : 'bg-text-dim')} />
                    Live
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label="Download logs" onClick={onDownload}>
                    <DownloadIcon />
                </Button>
            </div>
            {/* Rows are not virtualized: the live buffer is capped at 2,000 lines and the grep filter is
                deferred by the caller, so the DOM stays bounded. */}
            <div
                className="min-h-0 flex-1 overflow-auto bg-code-bg py-2 font-mono text-meta"
                role="list"
                aria-label="Log lines"
            >
                {error && live && (
                    <div className="px-3.5 py-2 text-danger" role="alert">
                        {error}
                    </div>
                )}
                {lines.map((log, i) => (
                    <div key={i} role="listitem" className="flex gap-3 px-3.5 py-px whitespace-nowrap text-text-2">
                        <span className="w-7 text-right text-text-dim">{i + 1}</span>
                        <span className="text-text-dim">{log.timestamp}</span>
                        <span className={cn('w-12 font-medium', LOG_LEVEL_COLOR[log.level])}>{log.level}</span>
                        <span className="flex-1">{log.message}</span>
                    </div>
                ))}
            </div>
            <div
                className="flex border-t border-border px-3.5 py-1.5 text-label text-text-muted"
                data-testid="log-status"
            >
                <span>
                    {live ? 'streaming' : 'snapshot'} · <span className="font-mono">{lines.length}</span> lines
                    {filtered && ' (filtered)'}
                </span>
                <div className="flex-1" />
                <span>{live ? 'following' : 'snapshot'}</span>
            </div>
        </Card>
    );
}
