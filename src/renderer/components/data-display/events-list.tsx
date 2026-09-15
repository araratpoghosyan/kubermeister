import type { ClusterEvent } from '../../../shared/k8s/events';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Presentational list of Kubernetes events. Renders bare rows (no outer container) so callers can
 * host it inside a tab `Card` or a `DetailCard`. Set `showObject` to false on object-scoped views
 * where the involved object is always the same and the column would be noise.
 */
export function EventsList({
    events,
    showObject = true,
    emptyMessage = 'No events found.',
    isLoading,
    isError,
}: {
    events: ClusterEvent[];
    showObject?: boolean;
    emptyMessage?: string;
    isLoading?: boolean;
    isError?: boolean;
}) {
    if (isLoading) {
        return <div className="px-4 py-6 text-center text-cell text-text-muted">Loading events…</div>;
    }
    if (isError) {
        return <div className="px-4 py-6 text-center text-cell text-text-muted">Failed to load events.</div>;
    }
    if (events.length === 0) {
        return <div className="px-4 py-6 text-center text-cell text-text-muted">{emptyMessage}</div>;
    }
    return (
        <div role="list" aria-label="Events">
            {events.map((event, i) => (
                <div
                    // Composite key (not index) so prepending one event re-renders one row instead of
                    // rewriting the whole list as rows slide down.
                    key={`${event.time}|${event.reason}|${event.object}|${event.message}`}
                    role="listitem"
                    className={cn(
                        'flex items-center gap-3 px-4 py-2.5 text-cell',
                        i < events.length - 1 && 'border-b border-border',
                    )}
                >
                    <span className="w-[60px] font-mono text-label text-text-dim">{event.time}</span>
                    <Badge
                        variant={event.type === 'Warning' ? 'warn' : 'neutral'}
                        className="w-16 justify-center rounded-sm"
                    >
                        {event.type}
                    </Badge>
                    <span className="w-[110px] truncate font-medium">{event.reason}</span>
                    {showObject && <span className="font-mono text-meta text-primary">{event.object}</span>}
                    <span className="flex-1 truncate text-text-muted">{event.message}</span>
                </div>
            ))}
        </div>
    );
}
