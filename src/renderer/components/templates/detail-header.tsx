import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { StatusBadge } from '@/components/data-display/status-badge';
import type { StatusTone } from '@/lib/status';
import { spaceKind } from '@/lib/utils';

export interface DetailHeaderProps {
    icon?: LucideIcon;
    eyebrow?: string;
    title: string;
    status?: { label: string; tone: StatusTone };
    meta?: string[];
    actions?: ReactNode;
}

/**
 * Shared detail-screen header: icon chip + eyebrow + title + status badge + a row of mono meta
 * strings, with optional right-aligned actions. Every detail screen renders this one header.
 */
export function DetailHeader({ icon: Icon, eyebrow, title, status, meta, actions }: DetailHeaderProps) {
    return (
        <div className="px-4.5 py-3.5">
            <div className="flex items-start gap-3.5">
                {Icon && (
                    <div className="flex size-9 items-center justify-center rounded-lg bg-accent-bg text-primary">
                        <Icon className="size-4.5" />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    {eyebrow && (
                        <div className="text-label font-medium tracking-wider text-text-muted uppercase">
                            {spaceKind(eyebrow)}
                        </div>
                    )}
                    <div className="flex items-center gap-2.5 text-base font-semibold tracking-tight">
                        <span className="truncate">{title}</span>
                        {status && <StatusBadge tone={status.tone}>{status.label}</StatusBadge>}
                    </div>
                    {meta && meta.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-3.5 font-mono text-meta text-text-muted">
                            {meta.map((m, i) => (
                                <span key={i}>{m}</span>
                            ))}
                        </div>
                    )}
                </div>
                {actions && <div className="flex gap-2">{actions}</div>}
            </div>
        </div>
    );
}
