import { ApiException, type V1CSIDriver, type V1CSINode, type V1CSIStorageCapacity } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = {
    listCSIDriver: vi.fn(),
    readCSIDriver: vi.fn(),
    listCSINode: vi.fn(),
    readCSINode: vi.fn(),
    listNamespacedCSIStorageCapacity: vi.fn(),
    listCSIStorageCapacityForAllNamespaces: vi.fn(),
    readNamespacedCSIStorageCapacity: vi.fn(),
};
const client = {
    apis: () => ({ storage }),
    getActiveNamespace: vi.fn<() => string | null>(),
    resolveObjectNamespace: (explicit?: string) => explicit ?? client.getActiveNamespace(),
    listItems: async <T>(
        ns: string | undefined,
        namespaced: (ns: string) => Promise<{ items: T[] }>,
        all: () => Promise<{ items: T[] }>,
    ) => {
        const resolved = ns ?? client.getActiveNamespace() ?? undefined;
        return resolved ? namespaced(resolved) : all();
    },
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ApiException && error.code === 404) return undefined;
            throw error;
        }
    },
    getNamespaced: async <T>(
        name: string,
        namespace: string | undefined,
        readOne: (name: string, ns: string) => Promise<T>,
    ) => {
        const ns = client.resolveObjectNamespace(namespace);
        if (!ns) return undefined;
        return client.readOrNull(() => readOne(name, ns));
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);

const csi = await import('../../../src/main/k8s/resources/csi.js');

const NOW = Date.parse('2026-09-16T12:00:00Z');
const HOUR = 3600 * 1000;

describe('csi driver transforms', () => {
    const driver: V1CSIDriver = {
        metadata: { name: 'ebs.csi.aws.com', creationTimestamp: new Date(NOW - HOUR), labels: { vendor: 'aws' } },
        spec: {
            attachRequired: true,
            podInfoOnMount: true,
            storageCapacity: true,
            fsGroupPolicy: 'File',
            volumeLifecycleModes: ['Persistent', 'Ephemeral'],
        },
    };

    it('reads what the driver needs and what it supports', () => {
        expect(csi.toCsiDriver(driver, NOW)).toEqual({
            name: 'ebs.csi.aws.com',
            attachRequired: true,
            podInfoOnMount: true,
            storageCapacity: true,
            fsGroupPolicy: 'File',
            modes: 'Persistent, Ephemeral',
            age: '1h',
        });
        expect(csi.toCsiDriverDetail(driver, NOW)).toMatchObject({ labels: [['vendor', 'aws']] });
    });

    it('treats an unset attachRequired as the API does, which is true', () => {
        // The other two flags default to false, so an omitted spec must not read as a driver that
        // publishes capacity or leaks pod info.
        expect(csi.toCsiDriver({ metadata: { name: 'local' }, spec: {} }, NOW)).toEqual({
            name: 'local',
            attachRequired: true,
            podInfoOnMount: false,
            storageCapacity: false,
            fsGroupPolicy: '—',
            modes: '—',
            age: '—',
        });
        expect(csi.toCsiDriver({ metadata: { name: 'x' }, spec: { attachRequired: false } }, NOW).attachRequired).toBe(
            false,
        );
    });
});

describe('csi node transforms', () => {
    const node: V1CSINode = {
        metadata: { name: 'node-1', creationTimestamp: new Date(NOW - 2 * HOUR) },
        spec: {
            drivers: [
                { name: 'ebs.csi.aws.com', nodeID: 'i-1', topologyKeys: [] },
                { name: 'efs.csi.aws.com', nodeID: 'i-1', topologyKeys: [] },
            ],
        },
    };

    it('counts and names the drivers registered on the node', () => {
        expect(csi.toCsiNode(node, NOW)).toEqual({
            name: 'node-1',
            drivers: 2,
            driverNames: 'ebs.csi.aws.com, efs.csi.aws.com',
            age: '2h',
        });
        expect(csi.toCsiNodeDetail(node, NOW)).toMatchObject({ labels: [], annotations: [] });
    });

    it('dashes a node with nothing registered', () => {
        expect(csi.toCsiNode({ metadata: { name: 'bare' }, spec: { drivers: [] } }, NOW)).toMatchObject({
            drivers: 0,
            driverNames: '—',
        });
    });
});

describe('csi storage capacity transforms', () => {
    const capacity: V1CSIStorageCapacity = {
        metadata: { name: 'csisc-abc', namespace: 'kube-system', creationTimestamp: new Date(NOW - HOUR) },
        storageClassName: 'fast',
        capacity: '500Gi',
        maximumVolumeSize: '100Gi',
        nodeTopology: { matchLabels: { 'topology.ebs.csi.aws.com/zone': 'eu-west-1a' } },
    };

    it('reads the room left and the segment it is about', () => {
        expect(csi.toCsiCapacity(capacity, NOW)).toEqual({
            name: 'csisc-abc',
            namespace: 'kube-system',
            storageClass: 'fast',
            capacity: '500Gi',
            maximumVolumeSize: '100Gi',
            topology: 'topology.ebs.csi.aws.com/zone=eu-west-1a',
            age: '1h',
        });
        expect(csi.toCsiCapacityDetail(capacity, NOW)).toMatchObject({ labels: [] });
    });

    it('dashes an unknown capacity and a cluster-wide segment', () => {
        expect(csi.toCsiCapacity({ metadata: { name: 'x' }, storageClassName: 'slow' }, NOW)).toEqual({
            name: 'x',
            namespace: '',
            storageClass: 'slow',
            capacity: '—',
            maximumVolumeSize: '—',
            topology: '—',
            age: '—',
        });
    });
});

describe('csi readers', () => {
    beforeEach(() => {
        for (const fn of Object.values(storage)) fn.mockReset();
        client.getActiveNamespace.mockReturnValue('team-a');
    });

    it('lists drivers and nodes cluster-wide and reads one of each', async () => {
        storage.listCSIDriver.mockResolvedValue({ items: [{ metadata: { name: 'ebs' }, spec: {} }] });
        storage.readCSIDriver.mockResolvedValue({ metadata: { name: 'ebs' }, spec: {} });
        storage.listCSINode.mockResolvedValue({ items: [{ metadata: { name: 'node-1' }, spec: { drivers: [] } }] });
        storage.readCSINode.mockResolvedValue({ metadata: { name: 'node-1' }, spec: { drivers: [] } });

        await expect(csi.listCsiDrivers()).resolves.toMatchObject([{ name: 'ebs' }]);
        expect(storage.listCSIDriver).toHaveBeenCalledWith();
        await expect(csi.getCsiDriver('ebs')).resolves.toMatchObject({ name: 'ebs' });
        await expect(csi.listCsiNodes()).resolves.toMatchObject([{ name: 'node-1' }]);
        await expect(csi.getCsiNode('node-1')).resolves.toMatchObject({ drivers: 0 });
    });

    it('lists capacities in the active namespace, or across the cluster with none', async () => {
        storage.listNamespacedCSIStorageCapacity.mockResolvedValue({ items: [{ metadata: { name: 'a' } }] });
        storage.listCSIStorageCapacityForAllNamespaces.mockResolvedValue({ items: [] });
        storage.readNamespacedCSIStorageCapacity.mockResolvedValue({ metadata: { name: 'a' } });

        await expect(csi.listCsiCapacities()).resolves.toMatchObject([{ name: 'a' }]);
        expect(storage.listNamespacedCSIStorageCapacity).toHaveBeenCalledWith({ namespace: 'team-a' });
        await expect(csi.getCsiCapacity('a', 'kube-system')).resolves.toMatchObject({ name: 'a' });

        client.getActiveNamespace.mockReturnValue(null);
        await expect(csi.listCsiCapacities()).resolves.toEqual([]);
        expect(storage.listCSIStorageCapacityForAllNamespaces).toHaveBeenCalled();
        // A single object still refuses to guess which namespace it lives in.
        await expect(csi.getCsiCapacity('a')).resolves.toBeNull();
    });

    it('answers null for a missing object', async () => {
        const gone = new ApiException(404, 'not found', {}, {});
        storage.readCSIDriver.mockRejectedValue(gone);
        storage.readCSINode.mockRejectedValue(gone);
        storage.readNamespacedCSIStorageCapacity.mockRejectedValue(gone);
        await expect(csi.getCsiDriver('gone')).resolves.toBeNull();
        await expect(csi.getCsiNode('gone')).resolves.toBeNull();
        await expect(csi.getCsiCapacity('gone', 'team-a')).resolves.toBeNull();
    });
});
