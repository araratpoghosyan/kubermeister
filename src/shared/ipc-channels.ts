/**
 * The exact set of IPC channel names the sandboxed preload forwards to the main process. A plain
 * string array with no imports so the preload bundle stays tiny. `ipc.ts` asserts at compile time
 * that this list and the schema registry name the same channels.
 */
export const IPC_CHANNELS = [
    'app.info',
    'update.state',
    'update.install',
    'startupChecks',
    'contexts.list',
    'context.current',
    'context.set',
    'namespace.set',
    'settings.get',
    'settings.set',
    'kubeconfig.pick',
    'kubeconfig.useDefault',
    'namespaces.list',
    'namespace.active',
    'cluster.active',
    'clusters.list',
    'nodes.list',
    'nodes.get',
] as const;

export type AllowedChannel = (typeof IPC_CHANNELS)[number];
