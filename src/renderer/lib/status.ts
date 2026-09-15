import type { ClusterStatus, NodeStatus } from '../../shared/k8s/status';
import type { NamespaceTone } from '../../shared/k8s/cluster';

/** Presentational tone a status badge renders with. */
export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';

export const CLUSTER_TONE: Record<ClusterStatus, StatusTone> = { Healthy: 'ok', Degraded: 'warn' };
export const NODE_TONE: Record<NodeStatus, StatusTone> = { Ready: 'ok', NotReady: 'danger', Cordoned: 'warn' };
export const NAMESPACE_TONE: Record<NamespaceTone, StatusTone> = { accent: 'accent', ok: 'ok', warn: 'warn' };

/** Tone for a resource-usage percentage: ok below 75, warn from 75, danger above 90. */
export function usageTone(percent: number): Extract<StatusTone, 'ok' | 'warn' | 'danger'> {
    return percent > 90 ? 'danger' : percent > 75 ? 'warn' : 'ok';
}
