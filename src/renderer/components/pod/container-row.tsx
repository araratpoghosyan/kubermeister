import { BoxIcon } from 'lucide-react';
import type { PodContainer } from '../../../shared/k8s/pods';
import { StatusBadge } from '@/components/data-display/status-badge';
import { CONTAINER_TONE } from '@/lib/status';
import { cn } from '@/lib/utils';

/** One container's spec, status and probes, as rendered in the pod-detail Containers card. */
export function ContainerRow({ container, divided }: { container: PodContainer; divided: boolean }) {
    const facts: [string, string][] = [
        ['Started', container.started],
        ['Restarts', String(container.restarts)],
        ['CPU req', container.cpuRequest],
        ['CPU lim', container.cpuLimit],
        ['Mem req', container.memRequest],
        ['Mem lim', container.memLimit],
    ];
    return (
        <div
            className={cn('grid grid-cols-[1.2fr_1fr_1fr] gap-4.5 p-4', divided && 'border-t border-border')}
            data-container={container.name}
        >
            <div>
                <div className="mb-1.5 flex items-center gap-2">
                    <BoxIcon className="size-3.5 text-primary" />
                    <span className="text-lead font-medium">{container.name}</span>
                    <StatusBadge tone={CONTAINER_TONE[container.state]}>{container.state}</StatusBadge>
                </div>
                <div className="font-mono text-label leading-relaxed break-all text-text-muted">{container.image}</div>
                <div className="mt-2 text-label text-text-muted">
                    Image ID <span className="font-mono">{container.imageId}</span> · Pull policy{' '}
                    <span className="font-mono">{container.pullPolicy}</span>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-cell">
                {facts.map(([k, v]) => (
                    <div key={k} className="contents">
                        <span className="text-text-muted">{k}</span>
                        <span className="font-mono">{v}</span>
                    </div>
                ))}
            </div>
            <div>
                <div className="mb-1.5 text-label text-text-muted">PROBES</div>
                {container.probes.length === 0 && <div className="text-meta text-text-dim">No probes configured.</div>}
                {container.probes.map((probe) => (
                    <div key={probe.kind} className="flex items-center gap-2 py-0.5 text-meta">
                        <span className="size-1.5 rounded-full bg-ok" />
                        <span className="w-16 text-text-2">{probe.kind}</span>
                        <span className="font-mono text-text-muted">{probe.spec}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}
