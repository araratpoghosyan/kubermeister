import { ChevronRightIcon } from 'lucide-react';
import type { OwnerChain } from '../../../shared/k8s/owners';
import { NavLink } from '@/components/layout/nav-link';
import { DetailCard } from '@/components/templates/detail-cards';

/**
 * Who runs this pod, read upwards: the ReplicaSet that made it and the Deployment behind that.
 * A kind the app has no screen for is named but not linked, which is honest about where the trail
 * goes cold rather than offering a link that lands nowhere.
 */
export function OwnerChainCard({ chain }: { chain: OwnerChain }) {
    if (chain.length === 0) return null;

    return (
        <DetailCard title="Controlled by" desc="The workload this pod belongs to">
            <div className="flex flex-wrap items-center gap-2" data-testid="owner-chain">
                {chain.map((link, index) => (
                    <div key={`${link.kind}/${link.name}`} className="flex items-center gap-2">
                        {index > 0 && <ChevronRightIcon className="size-3.5 text-text-dim" />}
                        <span className="text-meta text-text-muted">{link.kind}</span>
                        {link.path ? (
                            <NavLink to={link.path} className="font-mono text-cell text-primary hover:underline">
                                {link.name}
                            </NavLink>
                        ) : (
                            <span className="font-mono text-cell text-text-2">{link.name}</span>
                        )}
                    </div>
                ))}
            </div>
        </DetailCard>
    );
}
