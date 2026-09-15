import type { ClusterSparklines, HealthPoint, ResourceSeries } from '../../../shared/k8s/metrics.js';
import { apis, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { clusterSparklines, ensureSampler, nodeSeries, trackResourceSeries, workloadHealth } from '../sampler.js';

/*
 * Readers over the sampler. Each one makes sure sampling is running, so the first request starts
 * the history and later requests see it grow. They never touch the cluster themselves.
 */

export async function getSparklines(): Promise<ClusterSparklines> {
    ensureSampler();
    return clusterSparklines();
}

export async function getWorkloadHealth(): Promise<HealthPoint[]> {
    ensureSampler();
    return workloadHealth();
}

export async function getPodSeries(namespace: string, name: string): Promise<ResourceSeries> {
    ensureSampler();
    return trackResourceSeries(namespace, name);
}

export async function getNodeSeries(name: string): Promise<ResourceSeries> {
    ensureSampler();
    return nodeSeries(name);
}

/**
 * Element-wise sum of several series, tail-aligned to the shortest non-empty one: a pod tracked
 * more recently than its peers has a shorter series, and a plain minimum over all lengths would
 * blank the chart whenever one pod had just been added.
 */
export function sumSeries(series: ResourceSeries[]): ResourceSeries {
    const nonEmpty = series.filter((s) => s.cpu.length > 0);
    if (nonEmpty.length === 0) return { cpu: [], mem: [] };
    const len = Math.min(...nonEmpty.map((s) => s.cpu.length));
    const at = (values: number[], i: number) => values[values.length - len + i] ?? 0;
    return {
        cpu: Array.from({ length: len }, (_, i) => nonEmpty.reduce((sum, s) => sum + at(s.cpu, i), 0)),
        mem: Array.from({ length: len }, (_, i) => nonEmpty.reduce((sum, s) => sum + at(s.mem, i), 0)),
    };
}

/** A Deployment's usage: the sum of its pods' tracked series, pods matched by the selector labels. */
export function getDeploymentSeries(namespace: string, name: string): Promise<ResourceSeries> {
    return withK8s('metrics.deploymentSeries', async () => {
        ensureSampler();
        const deployment = await readOrNull(() => apis().apps.readNamespacedDeployment({ name, namespace }));
        const matchLabels = deployment?.spec?.selector?.matchLabels;
        if (!matchLabels) return { cpu: [], mem: [] };
        const labelSelector = Object.entries(matchLabels)
            .map(([k, v]) => `${k}=${v}`)
            .join(',');
        const pods = await apis().core.listNamespacedPod({ namespace, labelSelector });
        return sumSeries(pods.items.map((p) => trackResourceSeries(namespace, p.metadata?.name ?? '')));
    });
}
