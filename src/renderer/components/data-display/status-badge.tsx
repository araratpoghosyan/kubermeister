import { Badge } from '@/components/ui/badge';
import type { StatusTone } from '@/lib/status';
import { cn } from '@/lib/utils';

const TONE_CLASS: Record<StatusTone, string> = {
    ok: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    warn: 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400',
    danger: 'border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400',
    neutral: 'border-border bg-muted text-muted-foreground',
    accent: 'border-primary/30 bg-primary/10 text-primary',
};

export function StatusBadge({ tone, children }: { tone: StatusTone; children: string }) {
    return (
        <Badge variant="outline" data-tone={tone} className={cn('font-medium', TONE_CLASS[tone])}>
            {children}
        </Badge>
    );
}
