import { z } from 'zod';

export const podStatusSchema = z.enum([
    'Running',
    'Pending',
    'Succeeded',
    'Failed',
    'CrashLoop',
    'Error',
    'Terminating',
    'Unknown',
]);
export const containerStateSchema = z.enum(['Running', 'Completed', 'Failed', 'CrashLoop', 'Pending', 'Unknown']);

export const podSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    status: podStatusSchema,
    /** Ready containers over total, e.g. "2/3". */
    ready: z.string(),
    restarts: z.number().int().nonnegative(),
    age: z.string(),
    node: z.string(),
    /** Current CPU usage in millicores from metrics-server; 0 when no sample exists yet. */
    cpu: z.number(),
    /** Current memory usage in MiB from metrics-server; 0 when no sample exists yet. */
    mem: z.number(),
    /** Sum of container CPU limits in millicores; 0 when unset. */
    cpuLimit: z.number(),
    /** Sum of container memory limits in MiB; 0 when unset. */
    memLimit: z.number(),
});

export const podConditionSchema = z.object({
    type: z.string(),
    ok: z.boolean(),
    time: z.string(),
});

export const podProbeSchema = z.object({
    kind: z.enum(['Liveness', 'Readiness', 'Startup']),
    /** Human-readable probe spec, e.g. `httpGet /healthz:8080 · 10s`. */
    spec: z.string(),
});

export const podContainerSchema = z.object({
    name: z.string(),
    image: z.string(),
    imageId: z.string(),
    pullPolicy: z.string(),
    state: containerStateSchema,
    started: z.string(),
    restarts: z.number().int().nonnegative(),
    cpuRequest: z.string(),
    cpuLimit: z.string(),
    memRequest: z.string(),
    memLimit: z.string(),
    ports: z.array(z.string()),
    probes: z.array(podProbeSchema),
});

/** The detail view: the list row plus placement, networking, conditions, containers and metadata. */
export const podDetailSchema = podSchema.extend({
    podIP: z.string(),
    hostIP: z.string(),
    qos: z.string(),
    dnsPolicy: z.string(),
    serviceAccount: z.string(),
    conditions: z.array(podConditionSchema),
    containers: z.array(podContainerSchema),
    labels: z.array(z.tuple([z.string(), z.string()])),
    annotations: z.array(z.tuple([z.string(), z.string()])),
});

export type PodStatus = z.infer<typeof podStatusSchema>;
export type ContainerState = z.infer<typeof containerStateSchema>;
export type Pod = z.infer<typeof podSchema>;
export type PodCondition = z.infer<typeof podConditionSchema>;
export type PodProbe = z.infer<typeof podProbeSchema>;
export type PodContainer = z.infer<typeof podContainerSchema>;
export type PodDetail = z.infer<typeof podDetailSchema>;
