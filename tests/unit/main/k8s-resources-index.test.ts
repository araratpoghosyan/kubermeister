import { describe, expect, it, vi } from 'vitest';

const podsMod = { listPods: vi.fn(), getPod: vi.fn() };
vi.mock('../../../src/main/k8s/resources/pods.js', () => podsMod);
const configMod = { listConfigMaps: vi.fn(), getConfigMap: vi.fn(), listSecrets: vi.fn(), getSecret: vi.fn() };
vi.mock('../../../src/main/k8s/resources/config.js', () => configMod);
const networkMod = {
    listServices: vi.fn(),
    getService: vi.fn(),
    listIngresses: vi.fn(),
    getIngress: vi.fn(),
    listEndpoints: vi.fn(),
    getEndpoints: vi.fn(),
    listNetworkPolicies: vi.fn(),
    getNetworkPolicy: vi.fn(),
};
vi.mock('../../../src/main/k8s/resources/network.js', () => networkMod);
const storageMod = {
    listVolumes: vi.fn(),
    getVolume: vi.fn(),
    listClaims: vi.fn(),
    getClaim: vi.fn(),
    listStorageClasses: vi.fn(),
    getStorageClass: vi.fn(),
    listSnapshots: vi.fn(),
    getSnapshot: vi.fn(),
};
vi.mock('../../../src/main/k8s/resources/storage.js', () => storageMod);
const workloadsMod = {
    listDeployments: vi.fn(),
    getDeployment: vi.fn(),
    listStatefulSets: vi.fn(),
    getStatefulSet: vi.fn(),
    listDaemonSets: vi.fn(),
    getDaemonSet: vi.fn(),
    listJobs: vi.fn(),
    getJob: vi.fn(),
    listCronJobs: vi.fn(),
    getCronJob: vi.fn(),
    listAutoscalers: vi.fn(),
    getAutoscaler: vi.fn(),
};
vi.mock('../../../src/main/k8s/resources/workloads.js', () => workloadsMod);

const { listResources, getResource } = await import('../../../src/main/k8s/resources/index.js');

describe('generic resource dispatch', () => {
    it('routes list and get to the kind source and tags the output with the kind', async () => {
        podsMod.listPods.mockResolvedValue([{ name: 'web-1' }]);
        podsMod.getPod.mockResolvedValue(null);
        await expect(listResources({ kind: 'Pod', namespace: 'team-a' })).resolves.toEqual({
            kind: 'Pod',
            items: [{ name: 'web-1' }],
        });
        expect(podsMod.listPods).toHaveBeenCalledWith('team-a');
        await expect(getResource({ kind: 'Pod', name: 'web-1', namespace: 'team-a' })).resolves.toEqual({
            kind: 'Pod',
            item: null,
        });
        expect(podsMod.getPod).toHaveBeenCalledWith('web-1', 'team-a');
    });

    it('routes the workload kinds to their sources', async () => {
        workloadsMod.listDeployments.mockResolvedValue([{ name: 'web' }]);
        workloadsMod.getDeployment.mockResolvedValue({ name: 'web' });
        workloadsMod.listStatefulSets.mockResolvedValue([]);
        workloadsMod.getStatefulSet.mockResolvedValue(null);
        workloadsMod.listDaemonSets.mockResolvedValue([]);
        workloadsMod.getDaemonSet.mockResolvedValue(null);
        await expect(listResources({ kind: 'Deployment', namespace: 'a' })).resolves.toEqual({
            kind: 'Deployment',
            items: [{ name: 'web' }],
        });
        await expect(getResource({ kind: 'Deployment', name: 'web', namespace: 'a' })).resolves.toEqual({
            kind: 'Deployment',
            item: { name: 'web' },
        });
        await expect(listResources({ kind: 'StatefulSet' })).resolves.toEqual({ kind: 'StatefulSet', items: [] });
        await expect(getResource({ kind: 'StatefulSet', name: 'db' })).resolves.toEqual({
            kind: 'StatefulSet',
            item: null,
        });
        await expect(listResources({ kind: 'DaemonSet' })).resolves.toEqual({ kind: 'DaemonSet', items: [] });
        await expect(getResource({ kind: 'DaemonSet', name: 'agent' })).resolves.toEqual({
            kind: 'DaemonSet',
            item: null,
        });
    });

    it('routes the batch and autoscaler kinds to their sources', async () => {
        for (const fn of [workloadsMod.listJobs, workloadsMod.listCronJobs, workloadsMod.listAutoscalers]) {
            fn.mockResolvedValue([]);
        }
        for (const fn of [workloadsMod.getJob, workloadsMod.getCronJob, workloadsMod.getAutoscaler]) {
            fn.mockResolvedValue(null);
        }
        await expect(listResources({ kind: 'Job', namespace: 'a' })).resolves.toEqual({ kind: 'Job', items: [] });
        expect(workloadsMod.listJobs).toHaveBeenCalledWith('a');
        await expect(listResources({ kind: 'CronJob' })).resolves.toEqual({ kind: 'CronJob', items: [] });
        await expect(listResources({ kind: 'HorizontalPodAutoscaler' })).resolves.toEqual({
            kind: 'HorizontalPodAutoscaler',
            items: [],
        });
        await expect(getResource({ kind: 'Job', name: 'j' })).resolves.toEqual({ kind: 'Job', item: null });
        await expect(getResource({ kind: 'CronJob', name: 'c' })).resolves.toEqual({ kind: 'CronJob', item: null });
        await expect(getResource({ kind: 'HorizontalPodAutoscaler', name: 'h' })).resolves.toEqual({
            kind: 'HorizontalPodAutoscaler',
            item: null,
        });
    });

    it('routes the config kinds to their sources', async () => {
        configMod.listConfigMaps.mockResolvedValue([{ name: 'app-config' }]);
        configMod.getConfigMap.mockResolvedValue(null);
        configMod.listSecrets.mockResolvedValue([]);
        configMod.getSecret.mockResolvedValue(null);
        await expect(listResources({ kind: 'ConfigMap', namespace: 'a' })).resolves.toEqual({
            kind: 'ConfigMap',
            items: [{ name: 'app-config' }],
        });
        await expect(listResources({ kind: 'Secret' })).resolves.toEqual({ kind: 'Secret', items: [] });
        await expect(getResource({ kind: 'ConfigMap', name: 'c' })).resolves.toEqual({ kind: 'ConfigMap', item: null });
        await expect(getResource({ kind: 'Secret', name: 's' })).resolves.toEqual({ kind: 'Secret', item: null });
    });

    it('routes the network kinds to their sources', async () => {
        for (const fn of Object.values(networkMod)) fn.mockResolvedValue([]);
        networkMod.getService.mockResolvedValue(null);
        networkMod.getIngress.mockResolvedValue(null);
        networkMod.getEndpoints.mockResolvedValue(null);
        networkMod.getNetworkPolicy.mockResolvedValue(null);
        await expect(listResources({ kind: 'Service', namespace: 'a' })).resolves.toEqual({
            kind: 'Service',
            items: [],
        });
        expect(networkMod.listServices).toHaveBeenCalledWith('a');
        await expect(listResources({ kind: 'Ingress' })).resolves.toEqual({ kind: 'Ingress', items: [] });
        await expect(listResources({ kind: 'Endpoints' })).resolves.toEqual({ kind: 'Endpoints', items: [] });
        await expect(listResources({ kind: 'NetworkPolicy' })).resolves.toEqual({ kind: 'NetworkPolicy', items: [] });
        await expect(getResource({ kind: 'Service', name: 's' })).resolves.toEqual({ kind: 'Service', item: null });
        await expect(getResource({ kind: 'Ingress', name: 'i' })).resolves.toEqual({ kind: 'Ingress', item: null });
        await expect(getResource({ kind: 'Endpoints', name: 'e' })).resolves.toEqual({ kind: 'Endpoints', item: null });
        await expect(getResource({ kind: 'NetworkPolicy', name: 'n' })).resolves.toEqual({
            kind: 'NetworkPolicy',
            item: null,
        });
    });

    it('routes the storage kinds, passing no namespace to the cluster-scoped ones', async () => {
        for (const fn of Object.values(storageMod)) fn.mockResolvedValue([]);
        storageMod.getVolume.mockResolvedValue(null);
        storageMod.getClaim.mockResolvedValue(null);
        storageMod.getStorageClass.mockResolvedValue(null);
        storageMod.getSnapshot.mockResolvedValue(null);
        await expect(listResources({ kind: 'PersistentVolume', namespace: 'ignored' })).resolves.toEqual({
            kind: 'PersistentVolume',
            items: [],
        });
        expect(storageMod.listVolumes).toHaveBeenCalledWith();
        await expect(listResources({ kind: 'StorageClass', namespace: 'ignored' })).resolves.toEqual({
            kind: 'StorageClass',
            items: [],
        });
        expect(storageMod.listStorageClasses).toHaveBeenCalledWith();
        await expect(listResources({ kind: 'PersistentVolumeClaim', namespace: 'a' })).resolves.toEqual({
            kind: 'PersistentVolumeClaim',
            items: [],
        });
        expect(storageMod.listClaims).toHaveBeenCalledWith('a');
        await expect(listResources({ kind: 'VolumeSnapshot' })).resolves.toEqual({ kind: 'VolumeSnapshot', items: [] });
        await expect(getResource({ kind: 'PersistentVolume', name: 'pv' })).resolves.toEqual({
            kind: 'PersistentVolume',
            item: null,
        });
        expect(storageMod.getVolume).toHaveBeenCalledWith('pv');
        await expect(getResource({ kind: 'StorageClass', name: 'sc' })).resolves.toEqual({
            kind: 'StorageClass',
            item: null,
        });
        await expect(getResource({ kind: 'PersistentVolumeClaim', name: 'c' })).resolves.toEqual({
            kind: 'PersistentVolumeClaim',
            item: null,
        });
        await expect(getResource({ kind: 'VolumeSnapshot', name: 's' })).resolves.toEqual({
            kind: 'VolumeSnapshot',
            item: null,
        });
    });
});
