import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

/**
 * Draining a node is an eviction per pod, and which pods those are is a decision, not a lookup: a
 * daemon set puts its pod back the moment it goes, a static pod has no controller to reschedule it,
 * and a pod whose data lives in an emptyDir loses that data when it moves. The plan says what will
 * happen before anything does, and the same classification drives the drain itself, so the screen
 * can never show one plan and the cluster carry out another.
 */

export const drainPodSchema = z.object({
    name: z.string(),
    namespace: namespaceNameSchema,
});

/** Why a pod on the node is left where it is. */
export const drainSkipSchema = z.enum(['daemonSet', 'static', 'finished', 'unmanaged', 'emptyDir']);

export const drainOptionsSchema = z.object({
    /** Evict pods no controller owns; without this they are left alone, since nothing would bring them back. */
    force: z.boolean(),
    /** Evict pods with an emptyDir volume, whose contents are lost when the pod moves. */
    deleteEmptyDirData: z.boolean(),
    /** Seconds each pod gets to shut down; the pod's own default when omitted. */
    gracePeriodSeconds: z.number().int().min(0).max(3600).optional(),
});

export const drainPlanInputSchema = drainOptionsSchema.omit({ gracePeriodSeconds: true }).extend({
    name: z.string().min(1),
});

export const drainPlanSchema = z.object({
    evict: z.array(drainPodSchema),
    skip: z.array(drainPodSchema.extend({ reason: drainSkipSchema })),
});

/** Progress of one drain, in the order the events happen. */
export const drainEventSchema = z.discriminatedUnion('type', [
    /** The node stopped taking new pods; every drain starts here and this outlives a cancellation. */
    z.object({ type: z.literal('cordoned') }),
    z.object({ type: z.literal('plan'), plan: drainPlanSchema }),
    z.object({ type: z.literal('evicting'), pod: drainPodSchema }),
    z.object({ type: z.literal('evicted'), pod: drainPodSchema }),
    /** A disruption budget is holding this pod back; the drain keeps trying until it gives way. */
    z.object({ type: z.literal('blocked'), pod: drainPodSchema, reason: z.string() }),
    z.object({
        type: z.literal('done'),
        evicted: z.number().int().nonnegative(),
        left: z.number().int().nonnegative(),
    }),
]);

export type DrainPod = z.infer<typeof drainPodSchema>;
export type DrainSkip = z.infer<typeof drainSkipSchema>;
export type DrainOptions = z.infer<typeof drainOptionsSchema>;
export type DrainPlanInput = z.infer<typeof drainPlanInputSchema>;
export type DrainPlan = z.infer<typeof drainPlanSchema>;
export type DrainEvent = z.infer<typeof drainEventSchema>;

/** What each skip reason says on screen, so main and the renderer cannot word it differently. */
export const DRAIN_SKIP_LABEL: Record<DrainSkip, string> = {
    daemonSet: 'managed by a daemon set',
    static: 'static pod, no controller',
    finished: 'already finished',
    unmanaged: 'not managed by a controller',
    emptyDir: 'uses emptyDir storage',
};
