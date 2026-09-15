/**
 * The exact set of IPC channel names the sandboxed preload forwards to the main process. A plain
 * string array with no imports so the preload bundle stays tiny. `ipc.ts` asserts at compile time
 * that this list and the schema registry name the same channels. Push channels the renderer may
 * subscribe to are listed alongside for the same reason.
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
    'resources.list',
    'resources.get',
    'pods.logSnapshot',
    'events.forObject',
    'events.recent',
    'metrics.sparklines',
    'metrics.workloadHealth',
    'metrics.alerts',
    'metrics.podSeries',
    'metrics.nodeSeries',
    'metrics.deploymentSeries',
    'deployments.replicaSets',
    'deployments.rollouts',
    'configMaps.entries',
    'secrets.entries',
] as const;

export const SUBSCRIPTION_CHANNELS = ['update.state', 'open-settings'] as const;

/** Stream channels the preload's `stream()` accepts. Schemas live in `streams.ts`; this file stays import-free. */
export const STREAM_CHANNELS = ['resources.watch', 'pods.logs', 'pods.exec', 'pods.portForward'] as const;

/** Control channels the preload's `stream()` uses; the renderer never calls them directly. */
export const STREAM_CONTROL_CHANNELS = ['stream.start', 'stream.send', 'stream.stop'] as const;

export type AllowedChannel = (typeof IPC_CHANNELS)[number];
export type AllowedSubscription = (typeof SUBSCRIPTION_CHANNELS)[number];
export type AllowedStream = (typeof STREAM_CHANNELS)[number];
