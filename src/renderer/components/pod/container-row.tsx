import { BoxIcon, BugIcon, StepForwardIcon } from 'lucide-react';
import type { ContainerRole, PodContainer } from '../../../shared/k8s/pods';
import { StatusBadge } from '@/components/data-display/status-badge';
import { Meter } from '@/components/data-display/meter';
import { CONTAINER_TONE, usageTone } from '@/lib/status';
import { cn } from '@/lib/utils';

/** What each kind of container is, said once: an init step ran before the app, a debug one arrived after. */
const ROLE: Record<ContainerRole, { icon: typeof BoxIcon; label: string | null; title: string }> = {
    app: { icon: BoxIcon, label: null, title: 'Container' },
    init: { icon: StepForwardIcon, label: 'init', title: 'Ran to completion before the app containers started' },
    ephemeral: { icon: BugIcon, label: 'debug', title: 'Attached to the running pod for debugging' },
};

/** Usage against the request, when both are known: the share of what the container asked for. */
function usageRow(
    unit: string,
    used: number | null,
    requested: number | null,
): { text: string; percent: number | null } {
    if (used === null) return { text: '—', percent: null };
    if (!requested) return { text: `${used}${unit}`, percent: null };
    return { text: `${used}${unit} of ${requested}${unit}`, percent: Math.round((used / requested) * 100) };
}

/** One container's spec, status and probes, as rendered in the pod-detail Containers card. */
export function ContainerRow({ container, divided }: { container: PodContainer; divided: boolean }) {
    const facts: [string, string][] = [
        ['Started', container.started],
        ['Restarts', String(container.restarts)],
        ['CPU lim', container.cpuLimit],
        ['Mem lim', container.memLimit],
    ];
    const role = ROLE[container.role];
    const RoleIcon = role.icon;
    const cpu = usageRow('m', container.cpuUsed, container.cpuRequested);
    const mem = usageRow('Mi', container.memUsed, container.memRequested);
    return (
        <div
            className={cn('grid grid-cols-[1.2fr_1fr_1fr] gap-4.5 p-4', divided && 'border-t border-border')}
            data-container={container.name}
        >
            <div>
                <div className="mb-1.5 flex items-center gap-2">
                    <RoleIcon className="size-3.5 text-primary" aria-label={role.title} />
                    <span className="text-lead font-medium">{container.name}</span>
                    {role.label && (
                        <span className="rounded-sm bg-elev-3 px-1.5 py-0.5 text-label text-text-muted">
                            {role.label}
                        </span>
                    )}
                    <StatusBadge tone={CONTAINER_TONE[container.state]}>{container.state}</StatusBadge>
                </div>
                <div className="font-mono text-label leading-relaxed break-all text-text-muted">{container.image}</div>
                <div className="mt-2 text-label text-text-muted">
                    Image ID <span className="font-mono">{container.imageId}</span> · Pull policy{' '}
                    <span className="font-mono">{container.pullPolicy}</span>
                </div>
            </div>
            <div className="flex flex-col gap-2">
                {/* Usage against the request, which is the number that decides scheduling. */}
                {[
                    ['CPU', cpu],
                    ['Memory', mem],
                ].map(([label, row]) => {
                    const usage = row as { text: string; percent: number | null };
                    return (
                        <div key={label as string} data-usage={label as string}>
                            <div className="flex items-baseline justify-between text-cell">
                                <span className="text-text-muted">{label as string}</span>
                                <span className="font-mono">{usage.text}</span>
                            </div>
                            {usage.percent !== null && (
                                <Meter
                                    value={usage.percent}
                                    tone={usageTone(usage.percent)}
                                    className="mt-1"
                                    label={`${label as string} against request`}
                                />
                            )}
                        </div>
                    );
                })}
                <div className="grid grid-cols-2 gap-x-3.5 gap-y-1.5 text-cell">
                    {facts.map(([k, v]) => (
                        <div key={k} className="contents">
                            <span className="text-text-muted">{k}</span>
                            <span className="font-mono">{v}</span>
                        </div>
                    ))}
                </div>
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
