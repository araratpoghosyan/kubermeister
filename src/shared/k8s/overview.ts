import { z } from 'zod';

/**
 * Namespace-level budgets shown on the overview screens. One row per resource inside a quota or
 * limit range, so the tables read like `kubectl describe` rather than one row per object.
 */
export const resourceQuotaSchema = z.object({
    namespace: z.string(),
    name: z.string(),
    resource: z.string(),
    used: z.string(),
    hard: z.string(),
    /** Hard minus used, in the resource's own unit, or an em-dash when either side is unreadable. */
    remaining: z.string(),
    /** Used as a percentage of hard; 0 when the hard limit is zero or unreadable. */
    usage: z.number(),
});

export const limitRangeSchema = z.object({
    namespace: z.string(),
    name: z.string(),
    type: z.string(),
    resource: z.string(),
    min: z.string(),
    defaultRequest: z.string(),
    defaultLimit: z.string(),
    max: z.string(),
    maxRatio: z.string(),
});

export type ResourceQuota = z.infer<typeof resourceQuotaSchema>;
export type LimitRange = z.infer<typeof limitRangeSchema>;
