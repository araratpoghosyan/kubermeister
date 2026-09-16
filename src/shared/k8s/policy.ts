import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * The kinds that govern how the scheduler and the control plane treat everything else: what may be
 * disrupted, what gets scheduled first, and who currently holds a lease.
 */

/** A budget is Satisfied when it allows the disruptions it promises, and Blocked when it allows none. */
export const disruptionStatusSchema = z.enum(['Satisfied', 'Blocked']);

export const podDisruptionBudgetSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    status: disruptionStatusSchema,
    /** The `minAvailable` or `maxUnavailable` the budget was written with, as written. */
    policy: z.string(),
    currentHealthy: z.number().int().nonnegative(),
    desiredHealthy: z.number().int().nonnegative(),
    disruptionsAllowed: z.number().int().nonnegative(),
    /** The pods it covers, as a selector, or a dash when it selects everything. */
    selector: z.string(),
    age: z.string(),
});
export const podDisruptionBudgetDetailSchema = podDisruptionBudgetSchema.extend({
    labels: pairs,
    annotations: pairs,
});

export const priorityClassSchema = z.object({
    name: z.string(),
    /** Higher wins when the scheduler decides what to place and what to evict. */
    value: z.number().int(),
    globalDefault: z.boolean(),
    /** Whether pods of this class may evict lower-priority ones. */
    preemption: z.string(),
    description: z.string(),
    age: z.string(),
});
export const priorityClassDetailSchema = priorityClassSchema.extend({ labels: pairs, annotations: pairs });

export const leaseSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    /** Who holds it right now, which for a control-plane lease is the elected leader. */
    holder: z.string(),
    /** Lease duration in seconds, or a dash when unset. */
    duration: z.string(),
    /** How long ago it was last renewed; a lease not being renewed is the interesting case. */
    renewed: z.string(),
    age: z.string(),
});
export const leaseDetailSchema = leaseSchema.extend({ labels: pairs, annotations: pairs });

export type DisruptionStatus = z.infer<typeof disruptionStatusSchema>;
export type PodDisruptionBudget = z.infer<typeof podDisruptionBudgetSchema>;
export type PodDisruptionBudgetDetail = z.infer<typeof podDisruptionBudgetDetailSchema>;
export type PriorityClass = z.infer<typeof priorityClassSchema>;
export type PriorityClassDetail = z.infer<typeof priorityClassDetailSchema>;
export type Lease = z.infer<typeof leaseSchema>;
export type LeaseDetail = z.infer<typeof leaseDetailSchema>;
