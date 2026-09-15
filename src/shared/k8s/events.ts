import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

export const eventTypeSchema = z.enum(['Normal', 'Warning']);

/** One Kubernetes event as the renderer shows it: newest first, clock time, involved object as `kind/name`. */
export const clusterEventSchema = z.object({
    time: z.string(),
    type: eventTypeSchema,
    reason: z.string(),
    object: z.string(),
    namespace: z.string().optional(),
    message: z.string(),
});

export const objectEventsInputSchema = z.object({
    kind: z.string().min(1),
    name: z.string().min(1),
    /** Omitted for cluster-scoped kinds or to fall back to the active namespace. */
    namespace: namespaceNameSchema.optional(),
});

export type EventType = z.infer<typeof eventTypeSchema>;
export type ClusterEvent = z.infer<typeof clusterEventSchema>;
export type ObjectEventsInput = z.infer<typeof objectEventsInputSchema>;
