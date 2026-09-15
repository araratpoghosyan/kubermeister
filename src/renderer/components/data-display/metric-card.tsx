import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Sparkline } from './sparkline';

interface MetricCardProps {
    label: string;
    value: string;
    sub?: string;
    spark?: number[];
    sparkColor?: string;
    className?: string;
}

export function MetricCard({ label, value, sub, spark, sparkColor, className }: MetricCardProps) {
    return (
        <Card className={cn('gap-0 rounded-card p-3.5 shadow-none', className)} data-metric={label}>
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <div className="text-caption font-medium tracking-wide text-text-muted uppercase">{label}</div>
                    <div className="mt-1 font-mono text-title leading-none font-semibold tracking-tight tabular-nums">
                        {value}
                    </div>
                </div>
                {spark && <Sparkline data={spark} width={70} height={26} color={sparkColor} fill />}
            </div>
            {sub && <div className="mt-2 text-label text-text-muted">{sub}</div>}
        </Card>
    );
}
