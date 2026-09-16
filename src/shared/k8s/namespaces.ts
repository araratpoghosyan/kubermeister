import { z } from 'zod';
import { namespaceNameSchema } from './names.js';
import { limitRangeSchema, resourceQuotaSchema } from './overview.js';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * One namespace as a screen of its own. A namespace is not a thing that does anything; it is the
 * boundary everything else is counted inside, so its detail is a roll-up: what lives here, what it
 * is allowed, and what it currently uses.
 */

export const namespacePhaseSchema = z.enum(['Active', 'Terminating']);

/** One line of the count card: a kind and how many of it the namespace holds. */
export const namespaceCountSchema = z.object({
    kind: z.string(),
    count: z.number().int().nonnegative(),
    /** The list screen for that kind, so a count is a way in rather than a number to read. */
    listPath: z.string(),
});

export const namespaceDetailSchema = z.object({
    name: z.string(),
    phase: namespacePhaseSchema,
    age: z.string(),
    labels: pairs,
    annotations: pairs,
    counts: z.array(namespaceCountSchema),
    quotas: z.array(resourceQuotaSchema),
    limits: z.array(limitRangeSchema),
    /** Millicores and mebibytes summed over the namespace's pods, from the sampler's latest read. */
    cpuUsed: z.number().nonnegative(),
    memUsed: z.number().nonnegative(),
    /** What those pods asked for, so usage has something to be read against. */
    cpuRequested: z.number().nonnegative(),
    memRequested: z.number().nonnegative(),
});

export const namespaceDetailInputSchema = z.object({ name: namespaceNameSchema });

export type NamespacePhase = z.infer<typeof namespacePhaseSchema>;
export type NamespaceCount = z.infer<typeof namespaceCountSchema>;
export type NamespaceDetail = z.infer<typeof namespaceDetailSchema>;
