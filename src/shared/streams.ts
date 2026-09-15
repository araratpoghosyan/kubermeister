import { z } from 'zod';
import { STREAM_CHANNELS, type AllowedStream } from './ipc-channels.js';
import type { LogLine } from './k8s/logs.js';
import { namespaceNameSchema } from './k8s/names.js';
import { podSchema } from './k8s/pods.js';
import { endpointsSchema, ingressSchema, networkPolicySchema, serviceSchema } from './k8s/network.js';
import { customResourceSchema } from './k8s/addons.js';
import {
    clusterRoleBindingSchema,
    clusterRoleSchema,
    roleBindingSchema,
    roleSchema,
    serviceAccountSchema,
} from './k8s/access.js';
import type { Kind } from './k8s/registry.js';
import { claimSchema, storageClassSchema, volumeSchema } from './k8s/storage.js';
import { resourceListInputSchema, type ResourceListInput } from './k8s/resources.js';
import {
    autoscalerSchema,
    configMapSchema,
    cronJobSchema,
    daemonSetSchema,
    deploymentSchema,
    jobSchema,
    secretSchema,
    statefulSetSchema,
} from './k8s/workloads.js';

/**
 * Streaming contract, separate from the one-shot `invoke` channels. A stream pushes many messages
 * over time on a per-subscription event (`sub.<subId>`). The renderer opens one through
 * `window.km.stream(...)`, which returns a stop function; main pushes messages until the stream
 * ends or is stopped.
 */

export type StreamMessage<T = unknown> =
    { type: 'data'; data: T } | { type: 'error'; message: string } | { type: 'end' };

/** Sender given to main-side stream handlers. */
export type StreamSend = (message: StreamMessage) => void;

/** What a main-side stream handler returns: teardown, plus optional renderer-to-main input for bidirectional streams. */
export interface StreamController {
    stop: () => void;
    write?: (data: unknown) => void;
}

/** One change to a watched list. `added` also replays the current objects when a watch starts. */
const watchType = z.enum(['added', 'modified', 'deleted']);
export const watchEventSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('Pod'), type: watchType, item: podSchema }),
    z.object({ kind: z.literal('Deployment'), type: watchType, item: deploymentSchema }),
    z.object({ kind: z.literal('StatefulSet'), type: watchType, item: statefulSetSchema }),
    z.object({ kind: z.literal('DaemonSet'), type: watchType, item: daemonSetSchema }),
    z.object({ kind: z.literal('Job'), type: watchType, item: jobSchema }),
    z.object({ kind: z.literal('CronJob'), type: watchType, item: cronJobSchema }),
    z.object({ kind: z.literal('HorizontalPodAutoscaler'), type: watchType, item: autoscalerSchema }),
    z.object({ kind: z.literal('ConfigMap'), type: watchType, item: configMapSchema }),
    z.object({ kind: z.literal('Secret'), type: watchType, item: secretSchema }),
    z.object({ kind: z.literal('Service'), type: watchType, item: serviceSchema }),
    z.object({ kind: z.literal('Ingress'), type: watchType, item: ingressSchema }),
    z.object({ kind: z.literal('Endpoints'), type: watchType, item: endpointsSchema }),
    z.object({ kind: z.literal('NetworkPolicy'), type: watchType, item: networkPolicySchema }),
    z.object({ kind: z.literal('PersistentVolume'), type: watchType, item: volumeSchema }),
    z.object({ kind: z.literal('PersistentVolumeClaim'), type: watchType, item: claimSchema }),
    z.object({ kind: z.literal('StorageClass'), type: watchType, item: storageClassSchema }),
    z.object({ kind: z.literal('ServiceAccount'), type: watchType, item: serviceAccountSchema }),
    z.object({ kind: z.literal('Role'), type: watchType, item: roleSchema }),
    z.object({ kind: z.literal('RoleBinding'), type: watchType, item: roleBindingSchema }),
    z.object({ kind: z.literal('ClusterRole'), type: watchType, item: clusterRoleSchema }),
    z.object({ kind: z.literal('ClusterRoleBinding'), type: watchType, item: clusterRoleBindingSchema }),
    z.object({ kind: z.literal('CustomResourceDefinition'), type: watchType, item: customResourceSchema }),
]);

export type WatchEvent = z.infer<typeof watchEventSchema>;
export type WatchEventOf<K extends Kind> = Extract<WatchEvent, { kind: K }>;

const podTargetSchema = z.object({
    name: z.string().min(1),
    namespace: namespaceNameSchema,
    /** Container to address; defaults to the pod's first container. */
    container: z.string().min(1).optional(),
});

export const podLogsInputSchema = podTargetSchema.extend({
    /** Relative window in seconds; omitted means tail from `tailLines`. */
    sinceSeconds: z
        .number()
        .int()
        .positive()
        .max(365 * 24 * 3600)
        .optional(),
    /** Lines of backlog to start with. */
    tailLines: z.number().int().positive().max(10_000).optional(),
});

export const podExecInputSchema = podTargetSchema.extend({
    /** Command to run; defaults to a shell. */
    command: z.array(z.string().min(1)).min(1).max(32).optional(),
});

const tcpPort = z.number().int().min(1).max(65535);

export const podPortForwardInputSchema = podTargetSchema.omit({ container: true }).extend({
    targetPort: tcpPort,
    localPort: tcpPort,
});

export const portForwardStatusSchema = z.object({
    status: z.literal('listening'),
    localPort: tcpPort,
    targetPort: tcpPort,
});

export type PodLogsInput = z.infer<typeof podLogsInputSchema>;
export type PodExecInput = z.infer<typeof podExecInputSchema>;
export type PodPortForwardInput = z.infer<typeof podPortForwardInputSchema>;
export type PortForwardStatus = z.infer<typeof portForwardStatusSchema>;

/** Per-channel stream contract: renderer-to-main input and main-to-renderer data. */
export interface StreamContract extends Record<AllowedStream, { input: unknown; data: unknown }> {
    'resources.watch': { input: ResourceListInput; data: WatchEvent };
    'pods.logs': { input: PodLogsInput; data: LogLine };
    /** Raw terminal output; keystrokes travel back through `send`. */
    'pods.exec': { input: PodExecInput; data: string };
    'pods.portForward': { input: PodPortForwardInput; data: PortForwardStatus };
}

export { STREAM_CHANNELS };
export type StreamChannel = AllowedStream;
export type StreamInput<C extends StreamChannel> = StreamContract[C]['input'];
export type StreamData<C extends StreamChannel> = StreamContract[C]['data'];

/** Runtime input validation per stream channel, mirroring {@link StreamContract}. */
export const streamSchemas = {
    'resources.watch': resourceListInputSchema,
    'pods.logs': podLogsInputSchema,
    'pods.exec': podExecInputSchema,
    'pods.portForward': podPortForwardInputSchema,
} satisfies Record<StreamChannel, z.ZodType>;

/**
 * The renderer-minted subscription id becomes part of a `sub.<subId>` event name, so it is bounded
 * and limited to a safe character set: a malformed value must not forge an arbitrary event name.
 */
const subIdSchema = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w.:-]+$/);

export const streamStartSchema = z.object({
    channel: z.enum(STREAM_CHANNELS),
    subId: subIdSchema,
    input: z.unknown(),
});
export const streamSendSchema = z.object({ subId: subIdSchema, data: z.unknown() });
export const streamStopSchema = z.object({ subId: subIdSchema });
