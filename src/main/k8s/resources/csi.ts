import type { V1CSIDriver, V1CSINode, V1CSIStorageCapacity } from '@kubernetes/client-node';
import type {
    CsiCapacity,
    CsiCapacityDetail,
    CsiDriver,
    CsiDriverDetail,
    CsiNode,
    CsiNodeDetail,
} from '../../../shared/k8s/csi.js';
import { apis, getNamespaced, listItems, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { age, dash, joinSelector, toPairs } from '../format.js';

/*
 * The CSI plumbing: drivers the cluster knows, what each node has registered, and the room a
 * driver reports per topology segment. Pure transforms first, thin readers at the end.
 */

export function toCsiDriver(driver: V1CSIDriver, now = Date.now()): CsiDriver {
    const spec = driver.spec ?? {};
    return {
        name: driver.metadata?.name ?? '',
        attachRequired: spec.attachRequired !== false,
        podInfoOnMount: spec.podInfoOnMount === true,
        storageCapacity: spec.storageCapacity === true,
        fsGroupPolicy: dash(spec.fsGroupPolicy),
        modes: dash(spec.volumeLifecycleModes?.join(', ')),
        age: age(driver.metadata?.creationTimestamp, now),
    };
}

export function toCsiDriverDetail(driver: V1CSIDriver, now = Date.now()): CsiDriverDetail {
    return {
        ...toCsiDriver(driver, now),
        labels: toPairs(driver.metadata?.labels),
        annotations: toPairs(driver.metadata?.annotations),
    };
}

export function toCsiNode(node: V1CSINode, now = Date.now()): CsiNode {
    const drivers = node.spec?.drivers ?? [];
    return {
        name: node.metadata?.name ?? '',
        drivers: drivers.length,
        driverNames: dash(drivers.map((driver) => driver.name).join(', ')),
        age: age(node.metadata?.creationTimestamp, now),
    };
}

export function toCsiNodeDetail(node: V1CSINode, now = Date.now()): CsiNodeDetail {
    return {
        ...toCsiNode(node, now),
        labels: toPairs(node.metadata?.labels),
        annotations: toPairs(node.metadata?.annotations),
    };
}

export function toCsiCapacity(capacity: V1CSIStorageCapacity, now = Date.now()): CsiCapacity {
    return {
        name: capacity.metadata?.name ?? '',
        namespace: capacity.metadata?.namespace ?? '',
        storageClass: dash(capacity.storageClassName),
        capacity: dash(capacity.capacity),
        maximumVolumeSize: dash(capacity.maximumVolumeSize),
        // Matched labels are the only part of a topology selector worth a row; the expressions
        // behind it belong to the manifest.
        topology: joinSelector(capacity.nodeTopology?.matchLabels, '—'),
        age: age(capacity.metadata?.creationTimestamp, now),
    };
}

export function toCsiCapacityDetail(capacity: V1CSIStorageCapacity, now = Date.now()): CsiCapacityDetail {
    return {
        ...toCsiCapacity(capacity, now),
        labels: toPairs(capacity.metadata?.labels),
        annotations: toPairs(capacity.metadata?.annotations),
    };
}

export function listCsiDrivers(): Promise<CsiDriver[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().storage.listCSIDriver();
        return items.map((driver) => toCsiDriver(driver));
    });
}

export function getCsiDriver(name: string): Promise<CsiDriverDetail | null> {
    return withK8s('resources.get', async () => {
        const driver = await readOrNull(() => apis().storage.readCSIDriver({ name }));
        return driver ? toCsiDriverDetail(driver) : null;
    });
}

export function listCsiNodes(): Promise<CsiNode[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().storage.listCSINode();
        return items.map((node) => toCsiNode(node));
    });
}

export function getCsiNode(name: string): Promise<CsiNodeDetail | null> {
    return withK8s('resources.get', async () => {
        const node = await readOrNull(() => apis().storage.readCSINode({ name }));
        return node ? toCsiNodeDetail(node) : null;
    });
}

export function listCsiCapacities(namespace?: string): Promise<CsiCapacity[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().storage.listNamespacedCSIStorageCapacity({ namespace: ns }),
            () => apis().storage.listCSIStorageCapacityForAllNamespaces(),
        );
        return items.map((capacity) => toCsiCapacity(capacity));
    });
}

export function getCsiCapacity(name: string, namespace?: string): Promise<CsiCapacityDetail | null> {
    return withK8s('resources.get', async () => {
        const capacity = await getNamespaced(name, namespace, (n, ns) =>
            apis().storage.readNamespacedCSIStorageCapacity({ name: n, namespace: ns }),
        );
        return capacity ? toCsiCapacityDetail(capacity) : null;
    });
}
