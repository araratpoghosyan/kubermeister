import { AlertTriangleIcon } from 'lucide-react';
import { DetailCard } from '@/components/templates/detail-cards';
import { NavLink } from '@/components/layout/nav-link';
import { useIpcQuery } from '@/lib/query';
import type { ManifestKind } from '../../../shared/k8s/manifest';

/**
 * Owner and finalizers for any object, read through the one channel that serves every kind. Both
 * answer questions the view models cannot: what put this here, and what is holding it open.
 */
export function ObjectMetaCard({ kind, name, namespace }: { kind: ManifestKind; name: string; namespace?: string }) {
    const meta = useIpcQuery('resources.meta', { kind, name, namespace }).data;
    if (!meta) return null;

    return (
        <DetailCard title="Object">
            <div className="flex flex-col gap-2 text-body" data-testid="object-meta">
                <Row label="Owner">
                    {meta.owner ? (
                        meta.owner.path ? (
                            <NavLink to={meta.owner.path} className="font-mono text-primary hover:underline">
                                {meta.owner.kind}/{meta.owner.name}
                            </NavLink>
                        ) : (
                            <span className="font-mono text-text-2">
                                {meta.owner.kind}/{meta.owner.name}
                            </span>
                        )
                    ) : (
                        <span className="text-text-muted">—</span>
                    )}
                </Row>
                <Row label="Created">
                    <span className="font-mono text-text-2">{meta.created || '—'}</span>
                </Row>
                <Row label="Finalizers">
                    {meta.finalizers.length === 0 ? (
                        <span className="text-text-muted">—</span>
                    ) : (
                        <span className="flex flex-wrap items-center justify-end gap-1.5">
                            {meta.deleting && (
                                <span className="flex items-center gap-1 text-meta text-warn" data-testid="held-open">
                                    <AlertTriangleIcon className="size-3.5" />
                                    holding deletion
                                </span>
                            )}
                            {meta.finalizers.map((finalizer) => (
                                <span key={finalizer} className="font-mono text-meta text-text-2">
                                    {finalizer}
                                </span>
                            ))}
                        </span>
                    )}
                </Row>
            </div>
        </DetailCard>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="flex items-baseline justify-between gap-4">
            <span className="text-text-muted">{label}</span>
            {children}
        </div>
    );
}
