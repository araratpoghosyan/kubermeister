import { RefreshCwIcon } from 'lucide-react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { ComingSoonButton } from '@/components/coming-soon-button';
import { DetailMetrics } from '@/components/templates/detail-cards';
import { ContainerRow } from '@/components/pod/container-row';
import { useIpcQuery } from '@/lib/query';
import { useRefreshIntervalMs } from '@/lib/settings';
import { cn } from '@/lib/utils';

const last = (series: number[]) => series.at(-1);

/** Pod-detail Overview tab: live CPU and memory usage, conditions, and per-container detail. */
export function OverviewTab({ name, namespace, pod }: { name: string; namespace: string; pod?: PodDetail | null }) {
    const series = useIpcQuery('metrics.podSeries', { namespace, name }, { refetchInterval: useRefreshIntervalMs() });
    const cpu = series.data?.cpu ?? [];
    const mem = series.data?.mem ?? [];
    const conditions = pod?.conditions ?? [];
    const containers = pod?.containers ?? [];
    return (
        <>
            <DetailMetrics
                metrics={[
                    {
                        label: 'CPU',
                        value: cpu.length ? `${last(cpu)}m` : '—',
                        sub: cpu.length ? 'current usage' : 'no metrics yet',
                        spark: cpu,
                        sparkColor: 'var(--ok)',
                    },
                    {
                        label: 'Memory',
                        value: mem.length ? `${last(mem)}Mi` : '—',
                        sub: mem.length ? 'current usage' : 'no metrics yet',
                        spark: mem,
                        sparkColor: 'var(--warn)',
                    },
                ]}
            />

            <Card className="gap-0 rounded-card py-0 shadow-none" data-testid="conditions">
                <div className="border-b border-border px-4 py-3 text-body font-semibold">Conditions</div>
                <div>
                    {conditions.length === 0 && (
                        <div className="px-4 py-6 text-center text-cell text-text-muted">No conditions reported.</div>
                    )}
                    {conditions.map((c, i) => (
                        <div
                            key={c.type}
                            className={cn('flex items-center gap-2.5 px-4 py-2', i > 0 && 'border-t border-border')}
                            data-condition={c.type}
                            data-ok={String(c.ok)}
                        >
                            {c.ok ? <span className="text-ok">✓</span> : <span className="text-text-dim">—</span>}
                            <span className={cn('flex-1 text-body', c.ok ? 'text-foreground' : 'text-text-muted')}>
                                {c.type}
                            </span>
                            <span className="text-label text-text-muted">{c.time}</span>
                        </div>
                    ))}
                </div>
            </Card>

            <Card className="gap-0 rounded-card py-0 shadow-none" data-testid="containers">
                <div className="flex items-center border-b border-border px-4 py-3">
                    <div className="text-body font-semibold">Containers</div>
                    <Badge variant="neutral" className="ml-2 rounded-sm">
                        {containers.length}
                    </Badge>
                    <div className="flex-1" />
                    <ComingSoonButton variant="ghost" size="xs" tip="Restarting a pod arrives with the owner chain">
                        <RefreshCwIcon />
                        Restart
                    </ComingSoonButton>
                </div>
                {containers.map((container, i) => (
                    <ContainerRow key={container.name} container={container} divided={i > 0} />
                ))}
            </Card>
        </>
    );
}
