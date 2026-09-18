import type { CoreV1Event } from '@kubernetes/client-node';
import type { Alert } from '../../shared/k8s/metrics.js';
import { apis } from './client.js';
import { toPod } from './resources/pods.js';
import { toClaim } from './resources/storage.js';
import { toJob } from './resources/workloads.js';
import { nodeReady } from './resources/cluster.js';

/**
 * Alerts derived from cluster state without Prometheus. Each source is best-effort so a locked-down
 * cluster still yields what it can. Scope is cluster-wide by design: these feed the summary, whose
 * meaning must not change when the user scopes the top bar to a namespace.
 */

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
    try {
        return await fn();
    } catch {
        return fallback;
    }
}

/** A back-off event older than this describes a pod that has since settled or gone. */
export const RECENT_BACKOFF_MS = 10 * 60_000;

function eventTime(event: CoreV1Event): number {
    const stamp = event.lastTimestamp ?? event.eventTime ?? event.metadata?.creationTimestamp;
    return stamp ? new Date(stamp).getTime() : 0;
}

/**
 * Pod alerts without listing the cluster's pods, which on a busy cluster is megabytes on every
 * refresh. The API server can select on `status.phase`, so pending and failed pods come back as
 * exactly the pods in question; a CrashLoopBackOff pod is phase Running and no selector finds it,
 * so those are read off the Warning `BackOff` events the kubelet emits for them, which name the pod
 * and say whether it is a container restarting or an image that will not pull. Restart counts of
 * healthy pods are not read at all, so there is no "high restarts" alert here.
 */
export async function podAlerts(now = Date.now()): Promise<Alert[]> {
    const empty = { items: [] };
    const [pending, failed, backoffs] = await Promise.all([
        safe(() => apis().core.listPodForAllNamespaces({ fieldSelector: 'status.phase=Pending' }), empty),
        safe(() => apis().core.listPodForAllNamespaces({ fieldSelector: 'status.phase=Failed' }), empty),
        safe(
            () =>
                apis().core.listEventForAllNamespaces({
                    fieldSelector: 'type=Warning,reason=BackOff,involvedObject.kind=Pod',
                }),
            empty,
        ),
    ]);
    const alerts: Alert[] = [];
    const seen = new Set<string>();
    const report = (where: string, alert: Alert) => {
        if (seen.has(where)) return;
        seen.add(where);
        alerts.push(alert);
    };
    for (const pod of pending.items.map((p) => toPod(p))) {
        const where = `${pod.namespace}/${pod.name}`;
        if (pod.status === 'CrashLoop') {
            report(where, {
                tone: 'danger',
                title: `CrashLoopBackOff: ${pod.name}`,
                detail: `${pod.restarts} restarts — ${where}`,
            });
        } else if (pod.status === 'Error') {
            report(where, { tone: 'danger', title: `Image pull failure: ${pod.name}`, detail: where });
        } else {
            report(where, { tone: 'warn', title: `Pod pending: ${pod.name}`, detail: where });
        }
    }
    for (const pod of failed.items.map((p) => toPod(p))) {
        const where = `${pod.namespace}/${pod.name}`;
        report(where, { tone: 'danger', title: `Pod failed: ${pod.name}`, detail: where });
    }
    const recent = backoffs.items.filter((event) => now - eventTime(event) <= RECENT_BACKOFF_MS);
    const byPod = new Map<string, { event: CoreV1Event; count: number }>();
    for (const event of recent) {
        const obj = event.involvedObject;
        if (!obj?.name) continue;
        const where = `${obj.namespace ?? ''}/${obj.name}`;
        const entry = byPod.get(where);
        const count = event.count ?? 1;
        if (!entry || eventTime(event) > eventTime(entry.event))
            byPod.set(where, { event, count: (entry?.count ?? 0) + count });
        else entry.count += count;
    }
    for (const [where, { event, count }] of byPod) {
        const name = event.involvedObject?.name ?? '';
        const message = event.message ?? '';
        if (/pulling image/i.test(message)) {
            report(where, { tone: 'danger', title: `Image pull failure: ${name}`, detail: where });
        } else {
            report(where, {
                tone: 'danger',
                title: `CrashLoopBackOff: ${name}`,
                detail: `${count} back-off${count === 1 ? '' : 's'} in the last 10 min — ${where}`,
            });
        }
    }
    return alerts;
}

export async function nodeAlerts(): Promise<Alert[]> {
    const res = await safe(() => apis().core.listNode(), { items: [] });
    const alerts: Alert[] = [];
    for (const node of res.items) {
        const name = node.metadata?.name ?? '';
        if (!nodeReady(node)) {
            alerts.push({ tone: 'danger', title: `Node NotReady: ${name}`, detail: 'Ready condition is not True' });
        } else if (node.spec?.unschedulable) {
            alerts.push({ tone: 'warn', title: `Node cordoned: ${name}`, detail: 'Scheduling disabled' });
        }
    }
    return alerts;
}

export async function jobAlerts(): Promise<Alert[]> {
    const res = await safe(() => apis().batch.listJobForAllNamespaces(), { items: [] });
    return res.items
        .map((item) => toJob(item))
        .filter((job) => job.status === 'Failed')
        .map((job) => ({
            tone: 'danger' as const,
            title: `Job failed: ${job.name}`,
            detail: `completions ${job.completions} — ${job.namespace}/${job.name}`,
        }));
}

export async function claimAlerts(): Promise<Alert[]> {
    const res = await safe(() => apis().core.listPersistentVolumeClaimForAllNamespaces(), { items: [] });
    return res.items
        .map((item) => toClaim(item))
        .filter((claim) => claim.status === 'Pending' || claim.status === 'Lost')
        .map((claim) => ({
            tone: claim.status === 'Lost' ? ('danger' as const) : ('warn' as const),
            title: `PVC ${claim.status}: ${claim.name}`,
            detail: `${claim.storageClass} — ${claim.namespace}/${claim.name}`,
        }));
}

export const MAX_ALERTS = 20;

/** Danger first, then warnings, capped so the panel stays bounded. */
export async function listAlerts(): Promise<Alert[]> {
    const groups = await Promise.all([podAlerts(), nodeAlerts(), jobAlerts(), claimAlerts()]);
    const all = groups.flat();
    all.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === 'danger' ? -1 : 1));
    return all.slice(0, MAX_ALERTS);
}
