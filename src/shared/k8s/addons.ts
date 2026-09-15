import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

/** Helm's own release states, folded into the vocabulary the badges render. */
export const releaseStatusSchema = z.enum([
    'Deployed',
    'Superseded',
    'Failed',
    'Progressing',
    'Terminating',
    'Unknown',
]);

export const helmChartSchema = z.object({
    name: z.string(),
    repository: z.string(),
    latestVersion: z.string(),
    appVersion: z.string(),
    description: z.string(),
});

export const releaseSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    chart: z.string(),
    revision: z.number(),
    status: releaseStatusSchema,
    updated: z.string(),
    /** User-supplied values as YAML, read only on a detail read and absent when all defaults. */
    values: z.string().optional(),
});

export const releaseRevisionSchema = z.object({
    rev: z.string(),
    status: releaseStatusSchema,
    chartVersion: z.string(),
    updated: z.string(),
    description: z.string(),
});

export const releaseTargetSchema = z.object({ name: z.string().min(1), namespace: namespaceNameSchema });

export const customResourceSchema = z.object({
    name: z.string(),
    group: z.string(),
    version: z.string(),
    scope: z.string(),
    kind: z.string(),
    age: z.string(),
});
export const customResourceDetailSchema = customResourceSchema.extend({
    labels: z.array(z.tuple([z.string(), z.string()])),
    annotations: z.array(z.tuple([z.string(), z.string()])),
});

export type ReleaseStatus = z.infer<typeof releaseStatusSchema>;
export type HelmChart = z.infer<typeof helmChartSchema>;
export type Release = z.infer<typeof releaseSchema>;
export type ReleaseRevision = z.infer<typeof releaseRevisionSchema>;
export type ReleaseTarget = z.infer<typeof releaseTargetSchema>;
export type CustomResource = z.infer<typeof customResourceSchema>;
export type CustomResourceDetail = z.infer<typeof customResourceDetailSchema>;
