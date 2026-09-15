import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

/** Instantaneous usage of one object: CPU in millicores, memory in MiB. */
export const usageSchema = z.object({ cpu: z.number(), mem: z.number() });

/** A bounded series of recent sample points, oldest to newest. */
const seriesSchema = z.array(z.number());

export const clusterSparklinesSchema = z.object({
    nodes: seriesSchema,
    /** Cluster CPU usage as a percentage of allocatable, per sample. */
    cpu: seriesSchema,
    mem: seriesSchema,
});

export const healthPointSchema = z.object({
    /** Sample time, epoch milliseconds. */
    t: z.number(),
    cpu: z.number(),
    mem: z.number(),
});

export const alertSchema = z.object({
    tone: z.enum(['warn', 'danger']),
    title: z.string(),
    detail: z.string(),
});

/** Per-object recent usage: CPU in millicores, memory in MiB (nodes: percent of allocatable). */
export const resourceSeriesSchema = z.object({
    cpu: seriesSchema,
    mem: seriesSchema,
});

export const podSeriesInputSchema = z.object({ namespace: namespaceNameSchema, name: z.string().min(1) });
export const nodeSeriesInputSchema = z.object({ name: z.string().min(1) });
export const deploymentSeriesInputSchema = podSeriesInputSchema;

export type Usage = z.infer<typeof usageSchema>;
export type ClusterSparklines = z.infer<typeof clusterSparklinesSchema>;
export type HealthPoint = z.infer<typeof healthPointSchema>;
export type Alert = z.infer<typeof alertSchema>;
export type ResourceSeries = z.infer<typeof resourceSeriesSchema>;
