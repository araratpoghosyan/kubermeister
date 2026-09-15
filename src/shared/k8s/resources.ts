import { z } from 'zod';
import { podDetailSchema, podSchema } from './pods.js';
import { kindSchema } from './registry.js';
import {
    autoscalerDetailSchema,
    autoscalerSchema,
    configMapDetailSchema,
    configMapSchema,
    cronJobDetailSchema,
    cronJobSchema,
    daemonSetDetailSchema,
    daemonSetSchema,
    deploymentDetailSchema,
    deploymentSchema,
    jobDetailSchema,
    jobSchema,
    secretDetailSchema,
    secretSchema,
    statefulSetDetailSchema,
    statefulSetSchema,
} from './workloads.js';

/**
 * The generic resource channels. One `resources.list` and one `resources.get` serve every kind;
 * the output is a discriminated union on `kind`, so each kind keeps a precise view-model type
 * while the channel count stays flat.
 */
export const resourceListInputSchema = z.object({
    kind: kindSchema,
    /** Omitted: the active namespace, or all namespaces when none is selected. */
    namespace: z.string().optional(),
});

export const resourceGetInputSchema = z.object({
    kind: kindSchema,
    name: z.string().min(1),
    namespace: z.string().optional(),
});

export const resourceListOutputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('Pod'), items: z.array(podSchema) }),
    z.object({ kind: z.literal('Deployment'), items: z.array(deploymentSchema) }),
    z.object({ kind: z.literal('StatefulSet'), items: z.array(statefulSetSchema) }),
    z.object({ kind: z.literal('DaemonSet'), items: z.array(daemonSetSchema) }),
    z.object({ kind: z.literal('Job'), items: z.array(jobSchema) }),
    z.object({ kind: z.literal('CronJob'), items: z.array(cronJobSchema) }),
    z.object({ kind: z.literal('HorizontalPodAutoscaler'), items: z.array(autoscalerSchema) }),
    z.object({ kind: z.literal('ConfigMap'), items: z.array(configMapSchema) }),
    z.object({ kind: z.literal('Secret'), items: z.array(secretSchema) }),
]);

export const resourceGetOutputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('Pod'), item: podDetailSchema.nullable() }),
    z.object({ kind: z.literal('Deployment'), item: deploymentDetailSchema.nullable() }),
    z.object({ kind: z.literal('StatefulSet'), item: statefulSetDetailSchema.nullable() }),
    z.object({ kind: z.literal('DaemonSet'), item: daemonSetDetailSchema.nullable() }),
    z.object({ kind: z.literal('Job'), item: jobDetailSchema.nullable() }),
    z.object({ kind: z.literal('CronJob'), item: cronJobDetailSchema.nullable() }),
    z.object({ kind: z.literal('HorizontalPodAutoscaler'), item: autoscalerDetailSchema.nullable() }),
    z.object({ kind: z.literal('ConfigMap'), item: configMapDetailSchema.nullable() }),
    z.object({ kind: z.literal('Secret'), item: secretDetailSchema.nullable() }),
]);

export type ResourceListInput = z.infer<typeof resourceListInputSchema>;
export type ResourceGetInput = z.infer<typeof resourceGetInputSchema>;
export type ResourceListOutput = z.infer<typeof resourceListOutputSchema>;
export type ResourceGetOutput = z.infer<typeof resourceGetOutputSchema>;

/** The row type for a kind, recovered from the list output union. */
export type RowOf<K extends ResourceListOutput['kind']> = Extract<ResourceListOutput, { kind: K }>['items'][number];
/** The detail type for a kind, recovered from the get output union. */
export type DetailOf<K extends ResourceGetOutput['kind']> = NonNullable<
    Extract<ResourceGetOutput, { kind: K }>['item']
>;
