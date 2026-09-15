import type { ClusterStatus, NodeStatus } from '../../shared/k8s/status';
import type { NamespaceTone } from '../../shared/k8s/cluster';
import type { ContainerState, PodStatus } from '../../shared/k8s/pods';

/** Presentational tone a status badge renders with. */
export type StatusTone = 'ok' | 'warn' | 'danger' | 'neutral' | 'accent';

export const CLUSTER_TONE: Record<ClusterStatus, StatusTone> = { Healthy: 'ok', Degraded: 'warn' };
export const NODE_TONE: Record<NodeStatus, StatusTone> = { Ready: 'ok', NotReady: 'danger', Cordoned: 'warn' };
export const NAMESPACE_TONE: Record<NamespaceTone, StatusTone> = { accent: 'accent', ok: 'ok', warn: 'warn' };
export const POD_TONE: Record<PodStatus, StatusTone> = {
    Running: 'ok',
    Succeeded: 'ok',
    Pending: 'warn',
    Terminating: 'neutral',
    Unknown: 'neutral',
    CrashLoop: 'danger',
    Error: 'danger',
    Failed: 'danger',
};
export const CONTAINER_TONE: Record<ContainerState, StatusTone> = {
    Running: 'ok',
    Completed: 'ok',
    Pending: 'warn',
    Unknown: 'neutral',
    CrashLoop: 'danger',
    Failed: 'danger',
};

/** Tone for a resource-usage percentage: ok below 75, warn from 75, danger above 90. */
export function usageTone(percent: number): Extract<StatusTone, 'ok' | 'warn' | 'danger'> {
    return percent > 90 ? 'danger' : percent > 75 ? 'warn' : 'ok';
}
