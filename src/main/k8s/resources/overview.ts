import type { V1LimitRange, V1ResourceQuota } from '@kubernetes/client-node';
import type { LimitRange, ResourceQuota } from '../../../shared/k8s/overview.js';
import { apis, listItems } from '../client.js';
import { withK8s } from '../errors.js';
import { dash, formatQuantityDelta, quantityToNumber } from '../format.js';

/*
 * Quotas and limit ranges flatten to one row per resource, the way `kubectl describe` shows them.
 */

export function toResourceQuotaRows(quota: V1ResourceQuota): ResourceQuota[] {
    const namespace = quota.metadata?.namespace ?? '';
    const name = quota.metadata?.name ?? '';
    const hard = quota.status?.hard ?? quota.spec?.hard ?? {};
    const used = quota.status?.used ?? {};
    return Object.keys(hard).map((resource) => {
        const hardValue = quantityToNumber(resource, hard[resource]);
        const usedValue = quantityToNumber(resource, used[resource]);
        return {
            namespace,
            name,
            resource,
            used: used[resource] ?? '0',
            hard: hard[resource] ?? '0',
            remaining: formatQuantityDelta(resource, hard[resource], used[resource]),
            usage: hardValue > 0 ? Math.round((usedValue / hardValue) * 100) : 0,
        };
    });
}

export function listQuotas(namespace?: string): Promise<ResourceQuota[]> {
    return withK8s('quotas.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().core.listNamespacedResourceQuota({ namespace: ns }),
            () => apis().core.listResourceQuotaForAllNamespaces(),
        );
        return items.flatMap(toResourceQuotaRows);
    });
}

export function toLimitRangeRows(limitRange: V1LimitRange): LimitRange[] {
    const namespace = limitRange.metadata?.namespace ?? '';
    const name = limitRange.metadata?.name ?? '';
    const rows: LimitRange[] = [];
    for (const limit of limitRange.spec?.limits ?? []) {
        const resources = new Set([
            ...Object.keys(limit.min ?? {}),
            ...Object.keys(limit.defaultRequest ?? {}),
            ...Object.keys(limit._default ?? {}),
            ...Object.keys(limit.max ?? {}),
            ...Object.keys(limit.maxLimitRequestRatio ?? {}),
        ]);
        for (const resource of resources) {
            rows.push({
                namespace,
                name,
                type: limit.type,
                resource,
                min: dash(limit.min?.[resource]),
                defaultRequest: dash(limit.defaultRequest?.[resource]),
                defaultLimit: dash(limit._default?.[resource]),
                max: dash(limit.max?.[resource]),
                maxRatio: dash(limit.maxLimitRequestRatio?.[resource]),
            });
        }
    }
    return rows;
}

export function listLimits(namespace?: string): Promise<LimitRange[]> {
    return withK8s('limits.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().core.listNamespacedLimitRange({ namespace: ns }),
            () => apis().core.listLimitRangeForAllNamespaces(),
        );
        return items.flatMap(toLimitRangeRows);
    });
}
