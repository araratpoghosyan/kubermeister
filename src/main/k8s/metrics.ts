import { Metrics } from '@kubernetes/client-node';
import type { Usage } from '../../shared/k8s/metrics.js';
import { kubeConfig } from './client.js';
import { cpuToMillicores, memToMi } from './format.js';

/**
 * Pod usage from metrics.k8s.io keyed by `namespace/name`. metrics-server is optional: when the API
 * group is absent or unreachable the map is empty and lists still render with zero usage.
 */
export async function readPodUsage(): Promise<Map<string, Usage>> {
    const out = new Map<string, Usage>();
    try {
        const res = await new Metrics(kubeConfig()).getPodMetrics();
        for (const item of res.items) {
            // One item missing `containers` or `usage` must not truncate the map mid-loop.
            const containers = item.containers ?? [];
            out.set(`${item.metadata.namespace}/${item.metadata.name}`, {
                cpu: containers.reduce((sum, c) => sum + cpuToMillicores(c.usage?.cpu), 0),
                mem: containers.reduce((sum, c) => sum + memToMi(c.usage?.memory), 0),
            });
        }
    } catch {
        // metrics-server absent or unreachable: graceful empty.
    }
    return out;
}

/** Node usage from metrics.k8s.io keyed by node name; empty when metrics-server is unavailable. */
export async function readNodeUsage(): Promise<Map<string, Usage>> {
    const out = new Map<string, Usage>();
    try {
        const res = await new Metrics(kubeConfig()).getNodeMetrics();
        for (const item of res.items) {
            out.set(item.metadata.name, { cpu: cpuToMillicores(item.usage?.cpu), mem: memToMi(item.usage?.memory) });
        }
    } catch {
        // graceful empty.
    }
    return out;
}
