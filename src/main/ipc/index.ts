import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import type { IpcChannel, IpcInput, IpcOutput, IpcResult } from '../../shared/ipc.js';
import { ipcSchemas } from '../../shared/ipc.js';
import { reloadKubeConfig } from '../k8s/client.js';
import { getCurrentContext, listContexts, setContext, setNamespace } from '../k8s/context.js';
import { K8sError } from '../k8s/errors.js';
import { readPodLogSnapshot } from '../k8s/logs.js';
import { getActiveCluster, getActiveNamespaceInfo, listClusters, listNamespaces } from '../k8s/resources/cluster.js';
import { listEventsForObject } from '../k8s/resources/events.js';
import { getResource, listResources } from '../k8s/resources/index.js';
import { getNode, listNodes } from '../k8s/resources/nodes.js';
import { getSettings, updateSettings } from '../settings/store.js';
import { runStartupChecks } from '../startup/checks.js';
import { getUpdateState, installUpdate } from '../updater.js';

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => Promise<IpcOutput<C>>;
type Handlers = { [C in IpcChannel]: Handler<C> };

/**
 * Point the app at a different kubeconfig through the native file dialog. The path comes from the
 * OS picker, never from the renderer, so a compromised renderer cannot make the app read an
 * arbitrary file or run an exec credential plugin from one.
 */
async function pickKubeconfig(): Promise<string | null> {
    const owner = BrowserWindow.getFocusedWindow() ?? undefined;
    const options: Electron.OpenDialogOptions = {
        title: 'Choose a kubeconfig file',
        properties: ['openFile', 'showHiddenFiles'],
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    const path = result.canceled ? undefined : result.filePaths[0];
    if (!path) return null;
    updateSettings({ connection: { kubeconfigPath: path } });
    reloadKubeConfig();
    return path;
}

const handlers: Handlers = {
    'app.info': async () => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
    }),
    'update.state': async () => getUpdateState(),
    'update.install': async () => ({ ok: installUpdate() }),
    startupChecks: () => runStartupChecks(),
    'contexts.list': async () => listContexts(),
    'context.current': async () => getCurrentContext(),
    'context.set': async ({ name }) => setContext(name),
    'namespace.set': async ({ namespace }) => setNamespace(namespace),
    'settings.get': async () => getSettings(),
    'settings.set': async (patch) => updateSettings(patch),
    'kubeconfig.pick': async () => ({ path: await pickKubeconfig() }),
    'namespaces.list': () => listNamespaces(),
    'namespace.active': () => getActiveNamespaceInfo(),
    'cluster.active': () => getActiveCluster(),
    'clusters.list': () => listClusters(),
    'nodes.list': () => listNodes(),
    'nodes.get': ({ name }) => getNode(name),
    'resources.list': (input) => listResources(input),
    'resources.get': (input) => getResource(input),
    'pods.logSnapshot': (input) => readPodLogSnapshot(input),
    'events.forObject': (input) => listEventsForObject(input),
    'kubeconfig.useDefault': async () => {
        const settings = updateSettings({ connection: { kubeconfigPath: null } });
        reloadKubeConfig();
        return settings;
    },
};

/**
 * Registers one `ipcMain.handle` per channel in the shared contract. Input is validated before the
 * handler runs and output before it is returned, so a handler bug cannot leak an unexpected shape
 * to the renderer. Results travel in the {@link IpcResult} envelope: a classified `K8sError`
 * becomes `ok: false` with structure, anything else rejects the invoke as the bug it is.
 */
export function registerHandlers(): void {
    for (const channel of Object.keys(ipcSchemas) as IpcChannel[]) {
        ipcMain.handle(channel, async (_event, rawInput: unknown): Promise<IpcResult<unknown>> => {
            const schema = ipcSchemas[channel];
            const input = schema.input.parse(rawInput);
            try {
                const result = await handlers[channel](input as never);
                return { ok: true, data: schema.output.parse(result) };
            } catch (error) {
                if (error instanceof K8sError) return { ok: false, error: error.toIpcError() };
                throw error;
            }
        });
    }
}
