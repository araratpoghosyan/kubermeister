import { Badge } from '@/components/ui/badge';
import { StatusDot } from '@/components/data-display/status-dot';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

/** A status label with its tone dot, the one badge shape used for every resource status. */
export function StatusBadge({ tone, children, className }: { tone: StatusTone; children: string; className?: string }) {
    return (
        <Badge variant={tone} data-tone={tone} className={cn('gap-1.5 rounded-sm font-medium', className)}>
            <StatusDot tone={tone} />
            {children}
        </Badge>
    );
}
