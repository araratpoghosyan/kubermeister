import { z } from 'zod';
import type { AllowedChannel } from './ipc-channels.js';
import { kubeContextSchema } from './k8s/contexts.js';
import { clusterEventSchema, objectEventsInputSchema } from './k8s/events.js';
import { logLineSchema, podLogSnapshotInputSchema } from './k8s/logs.js';
import {
    alertSchema,
    clusterSparklinesSchema,
    deploymentSeriesInputSchema,
    healthPointSchema,
    nodeSeriesInputSchema,
    podSeriesInputSchema,
    resourceSeriesSchema,
} from './k8s/metrics.js';
import { ipcErrorSchema } from './k8s/errors.js';
import { clusterSchema, namespaceSchema } from './k8s/cluster.js';
import { nodeDetailSchema, nodeSchema } from './k8s/nodes.js';
import {
    resourceGetInputSchema,
    resourceGetOutputSchema,
    resourceListInputSchema,
    resourceListOutputSchema,
} from './k8s/resources.js';
import { settingsInputSchema, settingsSchema } from './settings.js';
import {
    configMapEntrySchema,
    namespacedNameSchema,
    replicaSetSchema,
    rolloutSchema,
    secretEntrySchema,
} from './k8s/workloads.js';

const noInput = z.object({});

const appInfoSchema = z.object({
    name: z.string(),
    version: z.string(),
    electron: z.string(),
    chrome: z.string(),
    node: z.string(),
    platform: z.string(),
});

/**
 * Where the in-app updater is. `unsupported` covers development builds and Linux packages that
 * cannot self-update (deb); `message` carries the reason or the error text.
 */
export const updateStateSchema = z.object({
    status: z.enum(['unsupported', 'idle', 'checking', 'up-to-date', 'downloading', 'downloaded', 'error']),
    /** Version being downloaded or ready to install. */
    version: z.string().optional(),
    /** Download progress, 0 to 100. */
    percent: z.number().min(0).max(100).optional(),
    message: z.string().optional(),
});

/** One startup preflight check. `error` blocks the app, `warning` lets it open. */
const startupCheckSchema = z.object({
    id: z.enum(['kubeconfig', 'cluster']),
    label: z.string(),
    status: z.enum(['ok', 'warning', 'error']),
    /** What was found, shown to the user as the reason. */
    detail: z.string().optional(),
    /** Actionable remediation shown when the check did not pass. */
    hint: z.string().optional(),
});

const startupReportSchema = z.object({
    checks: z.array(startupCheckSchema),
    /** False when any check is an error. */
    ok: z.boolean(),
});

const namespaceSelectionSchema = z.object({ namespace: z.string().nullable() });

/**
 * The renderer-to-main contract. Every channel declares its input and output schema; main validates
 * both at the boundary and the renderer recovers the types through `lib/ipc.ts`.
 */
export const ipcSchemas = {
    'app.info': { input: noInput, output: appInfoSchema },
    'update.state': { input: noInput, output: updateStateSchema },
    'update.install': { input: noInput, output: z.object({ ok: z.boolean() }) },
    startupChecks: { input: noInput, output: startupReportSchema },
    'contexts.list': { input: noInput, output: z.array(kubeContextSchema) },
    'context.current': { input: noInput, output: kubeContextSchema.nullable() },
    'context.set': { input: z.object({ name: z.string().min(1) }), output: kubeContextSchema },
    'namespace.set': { input: namespaceSelectionSchema, output: namespaceSelectionSchema },
    'settings.get': { input: noInput, output: settingsSchema },
    'settings.set': { input: settingsInputSchema, output: settingsSchema },
    // Kubeconfig path changes are dialog-gated: the renderer never supplies a path string.
    'kubeconfig.pick': { input: noInput, output: z.object({ path: z.string().nullable() }) },
    'kubeconfig.useDefault': { input: noInput, output: settingsSchema },
    'namespaces.list': { input: noInput, output: z.array(namespaceSchema) },
    'namespace.active': { input: noInput, output: namespaceSchema.nullable() },
    'cluster.active': { input: noInput, output: clusterSchema.nullable() },
    'clusters.list': { input: noInput, output: z.array(clusterSchema) },
    'nodes.list': { input: noInput, output: z.array(nodeSchema) },
    'nodes.get': { input: z.object({ name: z.string().min(1) }), output: nodeDetailSchema.nullable() },
    'resources.list': { input: resourceListInputSchema, output: resourceListOutputSchema },
    'resources.get': { input: resourceGetInputSchema, output: resourceGetOutputSchema },
    'pods.logSnapshot': { input: podLogSnapshotInputSchema, output: z.array(logLineSchema) },
    'events.forObject': { input: objectEventsInputSchema, output: z.array(clusterEventSchema) },
    'events.recent': { input: noInput, output: z.array(clusterEventSchema) },
    'metrics.sparklines': { input: noInput, output: clusterSparklinesSchema },
    'metrics.workloadHealth': { input: noInput, output: z.array(healthPointSchema) },
    'metrics.alerts': { input: noInput, output: z.array(alertSchema) },
    'metrics.podSeries': { input: podSeriesInputSchema, output: resourceSeriesSchema },
    'metrics.nodeSeries': { input: nodeSeriesInputSchema, output: resourceSeriesSchema },
    'metrics.deploymentSeries': { input: deploymentSeriesInputSchema, output: resourceSeriesSchema },
    'deployments.replicaSets': { input: namespacedNameSchema, output: z.array(replicaSetSchema) },
    'deployments.rollouts': { input: namespacedNameSchema, output: z.array(rolloutSchema) },
    'configMaps.entries': { input: namespacedNameSchema, output: z.array(configMapEntrySchema) },
    'secrets.entries': { input: namespacedNameSchema, output: z.array(secretEntrySchema) },
} as const;

/**
 * Every invoke resolves to this envelope. Expected failures (a classified cluster error) travel as
 * `ok: false` with structure the renderer can act on; unexpected exceptions still reject the
 * invoke, since those are bugs. The registry validates `data` against the channel's output schema.
 */
export const ipcResultSchema = z.discriminatedUnion('ok', [
    z.object({ ok: z.literal(true), data: z.unknown() }),
    z.object({ ok: z.literal(false), error: ipcErrorSchema }),
]);

export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: z.infer<typeof ipcErrorSchema> };

export type IpcSchemas = typeof ipcSchemas;
export type IpcChannel = keyof IpcSchemas;
export type IpcInput<C extends IpcChannel> = z.infer<IpcSchemas[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<IpcSchemas[C]['output']>;

export type AppInfo = z.infer<typeof appInfoSchema>;
export type UpdateState = z.infer<typeof updateStateSchema>;
export type StartupCheck = z.infer<typeof startupCheckSchema>;
export type StartupReport = z.infer<typeof startupReportSchema>;

// A channel added to one list but not the other is a type error, not a silent runtime gap.
type Assert<T extends true> = T;
type _AllChannelsAllowed = Assert<IpcChannel extends AllowedChannel ? true : false>;
type _NoStrayChannels = Assert<Exclude<AllowedChannel, IpcChannel> extends never ? true : false>;
