import type { ClusterSparklines, HealthPoint, ResourceSeries } from '../../../shared/k8s/metrics.js';
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
