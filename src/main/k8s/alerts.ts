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

const HIGH_RESTARTS = 5;

export async function podAlerts(): Promise<Alert[]> {
    const res = await safe(() => apis().core.listPodForAllNamespaces(), { items: [] });
    const alerts: Alert[] = [];
    for (const pod of res.items.map((p) => toPod(p))) {
        const where = `${pod.namespace}/${pod.name}`;
        if (pod.status === 'CrashLoop') {
            alerts.push({
                tone: 'danger',
                title: `CrashLoopBackOff: ${pod.name}`,
                detail: `${pod.restarts} restarts — ${where}`,
            });
        } else if (pod.status === 'Error') {
            alerts.push({ tone: 'danger', title: `Image pull failure: ${pod.name}`, detail: where });
        } else if (pod.status === 'Failed') {
            alerts.push({ tone: 'danger', title: `Pod failed: ${pod.name}`, detail: where });
        } else if (pod.status === 'Pending') {
            alerts.push({ tone: 'warn', title: `Pod pending: ${pod.name}`, detail: where });
        } else if (pod.restarts >= HIGH_RESTARTS) {
            alerts.push({
                tone: 'warn',
                title: `High restarts: ${pod.name}`,
                detail: `${pod.restarts} restarts — ${where}`,
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
