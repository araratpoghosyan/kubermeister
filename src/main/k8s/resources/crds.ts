import type { V1CustomResourceDefinition } from '@kubernetes/client-node';
import type { CustomResource, CustomResourceDetail } from '../../../shared/k8s/addons.js';
import { apis, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { age, toPairs } from '../format.js';

/** The version a custom resource is persisted as; the first one when none is marked for storage. */
function storageVersion(crd: V1CustomResourceDefinition): string {
    const versions = crd.spec?.versions ?? [];
    return versions.find((version) => version.storage)?.name ?? versions[0]?.name ?? '—';
}

export function toCustomResource(crd: V1CustomResourceDefinition, now = Date.now()): CustomResource {
    return {
        name: crd.metadata?.name ?? '',
        group: crd.spec?.group ?? '—',
        version: storageVersion(crd),
        scope: crd.spec?.scope ?? '—',
        kind: crd.spec?.names?.kind ?? '—',
        age: age(crd.metadata?.creationTimestamp, now),
    };
}

export function toCustomResourceDetail(crd: V1CustomResourceDefinition, now = Date.now()): CustomResourceDetail {
    return {
        ...toCustomResource(crd, now),
        labels: toPairs(crd.metadata?.labels),
        annotations: toPairs(crd.metadata?.annotations),
    };
}

export function listCustomResources(): Promise<CustomResource[]> {
    return withK8s('resources.list', async () => {
        const res = await apis().apiextensions.listCustomResourceDefinition();
        return res.items.map((crd) => toCustomResource(crd));
    });
}

export function getCustomResource(name: string): Promise<CustomResourceDetail | null> {
    return withK8s('resources.get', async () => {
        const crd = await readOrNull(() => apis().apiextensions.readCustomResourceDefinition({ name }));
        return crd ? toCustomResourceDetail(crd) : null;
    });
}
