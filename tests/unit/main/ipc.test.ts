import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, mergeSettings } from '../../../src/shared/settings';
import { K8sError } from '../../../src/main/k8s/errors';

type Listener = (event: unknown, input: unknown) => Promise<unknown>;
const registered = new Map<string, Listener>();

const dialog = { showOpenDialog: vi.fn() };
const focused = { id: 1 };
vi.mock('electron', () => ({
    app: { getName: () => 'Kubermeister', getVersion: () => '0.1.1' },
    ipcMain: { handle: (channel: string, listener: Listener) => registered.set(channel, listener) },
    BrowserWindow: { getFocusedWindow: () => focused },
    dialog,
}));

const updater = { getUpdateState: vi.fn(), installUpdate: vi.fn() };
const client = { reloadKubeConfig: vi.fn() };
const context = { listContexts: vi.fn(), getCurrentContext: vi.fn(), setContext: vi.fn(), setNamespace: vi.fn() };
const store = { getSettings: vi.fn(), updateSettings: vi.fn() };
const startup = { runStartupChecks: vi.fn() };
const resources = {
    listNamespaces: vi.fn(),
    getActiveNamespaceInfo: vi.fn(),
    getActiveCluster: vi.fn(),
    listClusters: vi.fn(),
};
const nodesMod = { listNodes: vi.fn(), getNode: vi.fn() };
const generic = { listResources: vi.fn(), getResource: vi.fn() };
const logsMod = { readPodLogSnapshot: vi.fn() };
const eventsMod = { listEventsForObject: vi.fn() };
const metricsMod = {
    getSparklines: vi.fn(),
    getWorkloadHealth: vi.fn(),
    getPodSeries: vi.fn(),
    getNodeSeries: vi.fn(),
};
const alertsMod = { listAlerts: vi.fn() };
vi.mock('../../../src/main/updater.js', () => updater);
vi.mock('../../../src/main/k8s/client.js', () => client);
vi.mock('../../../src/main/k8s/context.js', () => context);
vi.mock('../../../src/main/settings/store.js', () => store);
vi.mock('../../../src/main/startup/checks.js', () => startup);
vi.mock('../../../src/main/k8s/resources/cluster.js', () => resources);
vi.mock('../../../src/main/k8s/resources/nodes.js', () => nodesMod);
vi.mock('../../../src/main/k8s/resources/index.js', () => generic);
vi.mock('../../../src/main/k8s/logs.js', () => logsMod);
vi.mock('../../../src/main/k8s/resources/events.js', () => eventsMod);
vi.mock('../../../src/main/k8s/resources/metrics.js', () => metricsMod);
vi.mock('../../../src/main/k8s/alerts.js', () => alertsMod);

const { registerHandlers } = await import('../../../src/main/ipc/index.js');
const { ipcSchemas } = await import('../../../src/shared/ipc.js');

const alpha = { name: 'alpha', cluster: 'c', user: 'u', namespace: 'team-a', current: true };

async function invokeRaw(channel: string, input: unknown): Promise<unknown> {
    const listener = registered.get(channel);
    if (!listener) throw new Error(`no handler for ${channel}`);
    return listener({}, input);
}

/** Unwraps the `ok: true` envelope; failures surface as the envelope itself for inspection. */
async function invoke(channel: string, input: unknown): Promise<unknown> {
    const result = (await invokeRaw(channel, input)) as { ok: boolean; data?: unknown; error?: unknown };
    return result.ok ? result.data : result;
}

describe('registerHandlers', () => {
    // Under plain Node these two runtime versions do not exist; Electron always provides them.
    beforeAll(() => {
        Object.defineProperty(process.versions, 'electron', { value: '44.3.0', configurable: true });
        Object.defineProperty(process.versions, 'chrome', { value: '152.0.0.0', configurable: true });
    });
    afterAll(() => {
        delete (process.versions as Record<string, unknown>).electron;
        delete (process.versions as Record<string, unknown>).chrome;
    });

    beforeEach(() => {
        registered.clear();
        vi.clearAllMocks();
        store.getSettings.mockReturnValue(DEFAULT_SETTINGS);
        store.updateSettings.mockImplementation((patch) => mergeSettings(DEFAULT_SETTINGS, patch));
        registerHandlers();
    });

    it('registers one handler per channel in the contract', () => {
        expect([...registered.keys()].sort()).toEqual(Object.keys(ipcSchemas).sort());
    });

    it('answers app.info from the Electron runtime', async () => {
        await expect(invoke('app.info', {})).resolves.toEqual({
            name: 'Kubermeister',
            version: '0.1.1',
            electron: '44.3.0',
            chrome: '152.0.0.0',
            node: process.versions.node,
            platform: process.platform,
        });
    });

    it('rejects input that does not match the channel schema', async () => {
        await expect(invoke('app.info', 'not-an-object')).rejects.toThrow();
        await expect(invoke('context.set', { name: '' })).rejects.toThrow();
        expect(context.setContext).not.toHaveBeenCalled();
    });

    it('rejects handler output that does not match the channel schema', async () => {
        updater.getUpdateState.mockReturnValue({ status: 'exploded' });
        await expect(invoke('update.state', {})).rejects.toThrow();
    });

    it('forwards update.state and update.install to the updater', async () => {
        updater.getUpdateState.mockReturnValue({ status: 'downloaded', version: '0.2.0' });
        updater.installUpdate.mockReturnValue(true);
        await expect(invoke('update.state', {})).resolves.toEqual({ status: 'downloaded', version: '0.2.0' });
        await expect(invoke('update.install', {})).resolves.toEqual({ ok: true });
    });

    it('forwards the connection channels to the context module', async () => {
        context.listContexts.mockReturnValue([alpha]);
        context.getCurrentContext.mockReturnValue(alpha);
        context.setContext.mockReturnValue({ ...alpha, name: 'beta' });
        context.setNamespace.mockReturnValue({ namespace: 'x' });
        await expect(invoke('contexts.list', {})).resolves.toEqual([alpha]);
        await expect(invoke('context.current', {})).resolves.toEqual(alpha);
        await expect(invoke('context.set', { name: 'beta' })).resolves.toMatchObject({ name: 'beta' });
        expect(context.setContext).toHaveBeenCalledWith('beta');
        await expect(invoke('namespace.set', { namespace: 'x' })).resolves.toEqual({ namespace: 'x' });
        expect(context.setNamespace).toHaveBeenCalledWith('x');
    });

    it('runs the startup checks', async () => {
        startup.runStartupChecks.mockResolvedValue({ checks: [], ok: true });
        await expect(invoke('startupChecks', {})).resolves.toEqual({ checks: [], ok: true });
    });

    it('reads and patches settings, refusing a kubeconfig path from the renderer', async () => {
        await expect(invoke('settings.get', {})).resolves.toEqual(DEFAULT_SETTINGS);
        await invoke('settings.set', { session: { lastNamespace: 'ns' } });
        expect(store.updateSettings).toHaveBeenCalledWith({ session: { lastNamespace: 'ns' } });
        await invoke('settings.set', { connection: { kubeconfigPath: '/etc/passwd' } });
        expect(store.updateSettings).toHaveBeenLastCalledWith({});
    });

    it('applies a picked kubeconfig path and reloads the client', async () => {
        dialog.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: ['/home/u/.kube/other'] });
        await expect(invoke('kubeconfig.pick', {})).resolves.toEqual({ path: '/home/u/.kube/other' });
        expect(dialog.showOpenDialog).toHaveBeenCalledWith(
            focused,
            expect.objectContaining({ properties: ['openFile', 'showHiddenFiles'] }),
        );
        expect(store.updateSettings).toHaveBeenCalledWith({ connection: { kubeconfigPath: '/home/u/.kube/other' } });
        expect(client.reloadKubeConfig).toHaveBeenCalledOnce();
    });

    it('leaves settings alone when the picker is cancelled', async () => {
        dialog.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] });
        await expect(invoke('kubeconfig.pick', {})).resolves.toEqual({ path: null });
        expect(store.updateSettings).not.toHaveBeenCalled();
        expect(client.reloadKubeConfig).not.toHaveBeenCalled();
    });

    it('wraps successes in the ok envelope', async () => {
        await expect(invokeRaw('settings.get', {})).resolves.toEqual({ ok: true, data: DEFAULT_SETTINGS });
    });

    it('turns a classified cluster failure into an ok:false envelope instead of rejecting', async () => {
        nodesMod.listNodes.mockRejectedValue(new K8sError('forbidden', 'Access denied (RBAC).', 'nodes.list'));
        await expect(invokeRaw('nodes.list', {})).resolves.toEqual({
            ok: false,
            error: { kind: 'forbidden', detail: 'Access denied (RBAC).', op: 'nodes.list' },
        });
    });

    it('still rejects on unexpected exceptions', async () => {
        nodesMod.listNodes.mockRejectedValue(new TypeError('bug'));
        await expect(invokeRaw('nodes.list', {})).rejects.toThrow('bug');
    });

    it('forwards the cluster, namespace and node channels', async () => {
        const namespace = { name: 'team-a', pods: 2, tone: 'accent' };
        const clusterInfo = {
            name: 'alpha',
            nodes: 1,
            status: 'Healthy',
            version: '1.36.4',
            provider: 'k3s',
            region: '—',
        };
        const nodeRow = {
            name: 'n1',
            status: 'Ready',
            role: 'worker',
            version: 'v1',
            cpu: 4,
            memory: 7.8,
            cpuUsed: 25,
            memUsed: null,
            pods: 2,
            age: '3d',
            instanceType: '—',
        };
        resources.listNamespaces.mockResolvedValue([namespace]);
        resources.getActiveNamespaceInfo.mockResolvedValue(namespace);
        resources.getActiveCluster.mockResolvedValue(clusterInfo);
        resources.listClusters.mockResolvedValue([clusterInfo]);
        nodesMod.listNodes.mockResolvedValue([nodeRow]);
        nodesMod.getNode.mockResolvedValue(null);
        await expect(invoke('namespaces.list', {})).resolves.toEqual([namespace]);
        await expect(invoke('namespace.active', {})).resolves.toEqual(namespace);
        await expect(invoke('cluster.active', {})).resolves.toEqual(clusterInfo);
        await expect(invoke('clusters.list', {})).resolves.toEqual([clusterInfo]);
        await expect(invoke('nodes.list', {})).resolves.toEqual([nodeRow]);
        await expect(invoke('nodes.get', { name: 'missing' })).resolves.toBeNull();
        expect(nodesMod.getNode).toHaveBeenCalledWith('missing');
    });

    it('forwards the generic resource channels and validates the kind', async () => {
        const row = {
            name: 'web-1',
            namespace: 'team-a',
            status: 'Running',
            ready: '1/1',
            restarts: 0,
            age: '3d',
            node: 'n1',
            cpu: 0,
            mem: 0,
            cpuLimit: 0,
            memLimit: 0,
        };
        generic.listResources.mockResolvedValue({ kind: 'Pod', items: [row] });
        generic.getResource.mockResolvedValue({ kind: 'Pod', item: null });
        await expect(invoke('resources.list', { kind: 'Pod' })).resolves.toEqual({ kind: 'Pod', items: [row] });
        await expect(invoke('resources.get', { kind: 'Pod', name: 'web-1', namespace: 'team-a' })).resolves.toEqual({
            kind: 'Pod',
            item: null,
        });
        await expect(invoke('resources.list', { kind: 'Deployment' })).rejects.toThrow();
    });

    it('forwards the log snapshot and object events channels with their inputs', async () => {
        const line = { level: 'INFO', timestamp: 't', message: 'm' };
        logsMod.readPodLogSnapshot.mockResolvedValue([line]);
        await expect(
            invoke('pods.logSnapshot', { name: 'web-1', namespace: 'team-a', container: 'app', sinceSeconds: 300 }),
        ).resolves.toEqual([line]);
        expect(logsMod.readPodLogSnapshot).toHaveBeenCalledWith({
            name: 'web-1',
            namespace: 'team-a',
            container: 'app',
            sinceSeconds: 300,
        });
        await expect(invoke('pods.logSnapshot', { name: 'web-1' })).rejects.toThrow();

        const ev = { time: '12:00:00', type: 'Warning', reason: 'BackOff', object: 'pod/web-1', message: 'x' };
        eventsMod.listEventsForObject.mockResolvedValue([ev]);
        await expect(invoke('events.forObject', { kind: 'Pod', name: 'web-1', namespace: 'team-a' })).resolves.toEqual([
            ev,
        ]);
        await expect(invoke('events.forObject', { kind: '', name: 'web-1' })).rejects.toThrow();
    });

    it('forwards the metrics channels and validates their inputs', async () => {
        metricsMod.getSparklines.mockResolvedValue({ nodes: [1], cpu: [10], mem: [20] });
        metricsMod.getWorkloadHealth.mockResolvedValue([{ t: 1, cpu: 10, mem: 20 }]);
        metricsMod.getPodSeries.mockResolvedValue({ cpu: [1], mem: [2] });
        metricsMod.getNodeSeries.mockResolvedValue({ cpu: [3], mem: [4] });
        alertsMod.listAlerts.mockResolvedValue([{ tone: 'warn', title: 't', detail: 'd' }]);
        await expect(invoke('metrics.sparklines', {})).resolves.toEqual({ nodes: [1], cpu: [10], mem: [20] });
        await expect(invoke('metrics.workloadHealth', {})).resolves.toEqual([{ t: 1, cpu: 10, mem: 20 }]);
        await expect(invoke('metrics.alerts', {})).resolves.toEqual([{ tone: 'warn', title: 't', detail: 'd' }]);
        await expect(invoke('metrics.podSeries', { namespace: 'team-a', name: 'web-1' })).resolves.toEqual({
            cpu: [1],
            mem: [2],
        });
        expect(metricsMod.getPodSeries).toHaveBeenCalledWith('team-a', 'web-1');
        await expect(invoke('metrics.nodeSeries', { name: 'n1' })).resolves.toEqual({ cpu: [3], mem: [4] });
        await expect(invoke('metrics.podSeries', { name: 'web-1' })).rejects.toThrow();
    });

    it('resets to the default kubeconfig and reloads', async () => {
        await expect(invoke('kubeconfig.useDefault', {})).resolves.toMatchObject({
            connection: { kubeconfigPath: null },
        });
        expect(store.updateSettings).toHaveBeenCalledWith({ connection: { kubeconfigPath: null } });
        expect(client.reloadKubeConfig).toHaveBeenCalledOnce();
    });
});
