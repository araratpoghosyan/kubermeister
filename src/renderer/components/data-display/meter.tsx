import { cn } from '@/lib/utils';

export type MeterTone = 'accent' | 'ok' | 'warn' | 'danger';

const FILL_CLASS: Record<MeterTone, string> = {
    accent: 'bg-primary',
    ok: 'bg-ok',
    warn: 'bg-warn',
    danger: 'bg-danger',
};

interface MeterProps {
    /** 0 to 100; values outside are clamped. */
    value: number;
    tone?: MeterTone;
    className?: string;
    /** Accessible name for the meter (e.g. "CPU usage"); pairs with the announced percentage. */
    label?: string;
}

export function Meter({ value, tone = 'accent', className, label }: MeterProps) {
    const clamped = Math.min(100, Math.max(0, value));
    return (
        <div
            role="progressbar"
            aria-label={label}
            aria-valuenow={Math.round(clamped)}
            aria-valuemin={0}
            aria-valuemax={100}
            className={cn('h-1 w-full overflow-hidden rounded-full bg-elev-3', className)}
        >
            <div className={cn('h-full rounded-full', FILL_CLASS[tone])} style={{ width: `${clamped}%` }} />
        </div>
    );
}
