import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronDownIcon, DownloadIcon, SearchIcon } from 'lucide-react';
import type { LogLevel, LogLine } from '../../../shared/k8s/logs';
import { matchRanges, type LogSearch, type VisibleLine } from '@/lib/log-filter';
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

/** Tail sizes the console offers; the live buffer's own cap still applies above these. */
export const TAIL_OPTIONS = [100, 500, 2000] as const;

/** The level floors on offer: no floor, or hide everything below this level. */
export const LEVEL_OPTIONS: (LogLevel | null)[] = [null, 'INFO', 'WARN', 'ERROR'];

/** Height of one unwrapped row, which is what the virtualiser starts from before measuring. */
const ROW_HEIGHT = 18;

/** A small on/off control for the console's display options. */
function Toggle({
    pressed,
    onToggle,
    label,
    title,
}: {
    pressed: boolean;
    onToggle: () => void;
    label: string;
    title?: string;
}) {
    return (
        <Button
            variant={pressed ? 'default' : 'outline'}
            size="xs"
            aria-pressed={pressed}
            aria-label={label}
            title={title}
            onClick={onToggle}
        >
            {label}
        </Button>
    );
}

/** A labelled dropdown over a fixed set of options. */
function Picker<T extends { key: string }>({
    label,
    value,
    options,
    onSelect,
}: {
    label: string;
    value: string;
    options: T[];
    onSelect: (option: T) => void;
}) {
    return (
        <>
            <span className="text-meta text-text-muted">{label}</span>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="xs" aria-label={label}>
                        {value}
                        <ChevronDownIcon />
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                    {options.map((option) => (
                        <DropdownMenuItem key={option.key} onSelect={() => onSelect(option)}>
                            {option.key}
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuContent>
            </DropdownMenu>
        </>
    );
}

/** One message with its matches marked in place, so a search can highlight without hiding. */
function highlight(message: string, search: LogSearch) {
    const ranges = matchRanges(message, search);
    if (ranges.length === 0) return message;
    const parts: (string | React.JSX.Element)[] = [];
    let at = 0;
    ranges.forEach(([start, end], index) => {
        if (start > at) parts.push(message.slice(at, start));
        parts.push(
            <mark key={index} className="rounded-sm bg-warn/30 text-inherit">
                {message.slice(start, end)}
            </mark>,
        );
        at = end;
    });
    if (at < message.length) parts.push(message.slice(at));
    return parts;
}

interface LogViewerProps {
    /** Already filtered by the caller, each line marked with whether the search matched it. */
    lines: VisibleLine<LogLine & { pod?: string }>[];
    /** Colour per pod, for a view following several at once; absent for a single container. */
    podColors?: Map<string, string>;
    containers: string[];
    container?: string;
    onContainerChange: (container: string) => void;
    since: SinceOption;
    onSinceChange: (since: SinceOption) => void;
    live: boolean;
    onLiveToggle: () => void;
    search: LogSearch;
    onSearchChange: (search: LogSearch) => void;
    /** Hide everything below this level; null shows every line. */
    minLevel: LogLevel | null;
    onMinLevelChange: (level: LogLevel | null) => void;
    tailLines: number;
    onTailLinesChange: (tail: number) => void;
    timestamps: boolean;
    onTimestampsToggle: () => void;
    wrap: boolean;
    onWrapToggle: () => void;
    /** Follow the previous run of the container: where a crash loop left its reason. */
    previous: boolean;
    onPreviousToggle: () => void;
    onDownload: () => void;
    /** Rendered above the rows when the live stream errors. */
    error?: string | null;
    /** True when `lines` has been narrowed by the search or the level floor. */
    filtered?: boolean;
    /** True when the search is meant as a pattern and is not a valid one yet. */
    brokenPattern?: boolean;
}

/**
 * Presentational log console: container and since pickers, grep, a Live toggle, and the rendered
 * lines. State and the log source (snapshot or live stream) are owned by the caller.
 */
export function LogViewer({
    lines,
    podColors,
    containers,
    container,
    onContainerChange,
    since,
    onSinceChange,
    live,
    onLiveToggle,
    search,
    onSearchChange,
    minLevel,
    onMinLevelChange,
    tailLines,
    onTailLinesChange,
    timestamps,
    onTimestampsToggle,
    wrap,
    onWrapToggle,
    previous,
    onPreviousToggle,
    onDownload,
    error,
    filtered,
    brokenPattern,
}: LogViewerProps) {
    const scrollRef = useRef<HTMLDivElement>(null);
    // Wrapped lines have no single height, so each is measured; unwrapped ones all match the
    // estimate and the measurement costs nothing.
    const virtualizer = useVirtualizer({
        count: lines.length,
        getScrollElement: () => scrollRef.current,
        estimateSize: () => ROW_HEIGHT,
        overscan: 20,
        // A first guess at the console's size, replaced the moment it is measured: without one,
        // nothing is mounted until layout has run, and the first paint of a log is blank.
        initialRect: { width: 900, height: 600 },
    });

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
                        value={search.query}
                        onChange={(e) => onSearchChange({ ...search, query: e.target.value })}
                        placeholder="search…"
                        aria-label="Filter log lines"
                        className={cn('h-7 pl-7 text-cell', brokenPattern && 'border-danger')}
                    />
                </div>
                <Toggle
                    pressed={search.regex}
                    onToggle={() => onSearchChange({ ...search, regex: !search.regex })}
                    label=".*"
                    title="Read the search as a regular expression"
                />
                <Toggle
                    pressed={search.caseSensitive}
                    onToggle={() => onSearchChange({ ...search, caseSensitive: !search.caseSensitive })}
                    label="Aa"
                    title="Match case"
                />
                <Toggle
                    pressed={search.highlightOnly}
                    onToggle={() => onSearchChange({ ...search, highlightOnly: !search.highlightOnly })}
                    label="Mark"
                    title="Mark matches instead of hiding what does not match"
                />
                <Button variant={live ? 'default' : 'outline'} size="xs" onClick={onLiveToggle} aria-pressed={live}>
                    <span className={cn('size-1.5 rounded-full', live ? 'animate-pulse bg-ok' : 'bg-text-dim')} />
                    Live
                </Button>
                <Button variant="ghost" size="icon-xs" aria-label="Download logs" onClick={onDownload}>
                    <DownloadIcon />
                </Button>
            </div>
            <div
                className="flex flex-wrap items-center gap-2 border-b border-border px-3.5 py-1.5"
                data-testid="log-options"
            >
                <Picker
                    label="Level"
                    value={minLevel ?? 'All levels'}
                    options={LEVEL_OPTIONS.map((level) => ({ key: level ?? 'All levels', level }))}
                    onSelect={(option) => onMinLevelChange(option.level)}
                />
                <Picker
                    label="Tail"
                    value={String(tailLines)}
                    options={TAIL_OPTIONS.map((tail) => ({ key: String(tail), tail }))}
                    onSelect={(option) => onTailLinesChange(option.tail)}
                />
                <Toggle pressed={timestamps} onToggle={onTimestampsToggle} label="Timestamps" />
                <Toggle pressed={wrap} onToggle={onWrapToggle} label="Wrap" />
                <Toggle
                    pressed={previous}
                    onToggle={onPreviousToggle}
                    label="Previous"
                    title="Read the previous run of this container"
                />
                {brokenPattern && <span className="text-label text-danger">Not a valid pattern yet</span>}
            </div>
            {/* Only the rows in view are mounted: the buffer can be tens of thousands of lines, and
                every one of them in the DOM is what makes a log console crawl. */}
            <div
                ref={scrollRef}
                className="min-h-0 flex-1 overflow-auto bg-code-bg py-2 font-mono text-meta"
                role="list"
                aria-label="Log lines"
                data-testid="log-rows"
            >
                {error && live && (
                    <div className="px-3.5 py-2 text-danger" role="alert">
                        {error}
                    </div>
                )}
                <div className="relative w-full" style={{ height: `${virtualizer.getTotalSize()}px` }}>
                    {virtualizer.getVirtualItems().map((item) => {
                        const { line: log, match } = lines[item.index]!;
                        return (
                            <div
                                key={item.key}
                                ref={virtualizer.measureElement}
                                data-index={item.index}
                                role="listitem"
                                data-match={match ? 'true' : undefined}
                                className={cn(
                                    'absolute top-0 left-0 flex w-full gap-3 px-3.5 py-px text-text-2',
                                    wrap ? 'whitespace-pre-wrap' : 'whitespace-nowrap',
                                    match && 'bg-elev-3',
                                )}
                                style={{ transform: `translateY(${item.start}px)` }}
                            >
                                <span className="w-7 shrink-0 text-right text-text-dim">{item.index + 1}</span>
                                {log.pod && (
                                    <span
                                        className={cn(
                                            'w-40 shrink-0 truncate',
                                            podColors?.get(log.pod) ?? 'text-text-2',
                                        )}
                                        title={log.pod}
                                    >
                                        {log.pod}
                                    </span>
                                )}
                                {timestamps && <span className="shrink-0 text-text-dim">{log.timestamp}</span>}
                                <span className={cn('w-12 shrink-0 font-medium', LOG_LEVEL_COLOR[log.level])}>
                                    {log.level}
                                </span>
                                <span className="flex-1">{highlight(log.message, search)}</span>
                            </div>
                        );
                    })}
                </div>
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
