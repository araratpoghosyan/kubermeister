import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * The CSI plumbing behind the volume kinds: which drivers the cluster has, what each node has
 * registered, and how much room a driver reports per topology. Volumes and claims say what was
 * asked for; these three say what can actually answer.
 */

export const csiDriverSchema = z.object({
    name: z.string(),
    /** Whether a volume of this driver needs an attach step before it can be mounted. */
    attachRequired: z.boolean(),
    podInfoOnMount: z.boolean(),
    /** Whether the driver publishes CSIStorageCapacity objects. */
    storageCapacity: z.boolean(),
    fsGroupPolicy: z.string(),
    /** Volume lifecycle modes the driver supports, joined, or a dash. */
    modes: z.string(),
    age: z.string(),
});
export const csiDriverDetailSchema = csiDriverSchema.extend({ labels: pairs, annotations: pairs });

export const csiNodeSchema = z.object({
    /** A CSINode is named after the node it describes. */
    name: z.string(),
    drivers: z.number().int().nonnegative(),
    /** The driver names registered on that node, joined, or a dash when none are. */
    driverNames: z.string(),
    age: z.string(),
});
export const csiNodeDetailSchema = csiNodeSchema.extend({ labels: pairs, annotations: pairs });

export const csiCapacitySchema = z.object({
    name: z.string(),
    namespace: z.string(),
    storageClass: z.string(),
    /** Room left in the topology segment, as the driver reports it, or a dash when unknown. */
    capacity: z.string(),
    /** Largest single volume the segment can still satisfy, or a dash. */
    maximumVolumeSize: z.string(),
    /** The topology segment this capacity is about, as a selector, or a dash for the whole cluster. */
    topology: z.string(),
    age: z.string(),
});
export const csiCapacityDetailSchema = csiCapacitySchema.extend({ labels: pairs, annotations: pairs });

export type CsiDriver = z.infer<typeof csiDriverSchema>;
export type CsiDriverDetail = z.infer<typeof csiDriverDetailSchema>;
export type CsiNode = z.infer<typeof csiNodeSchema>;
export type CsiNodeDetail = z.infer<typeof csiNodeDetailSchema>;
export type CsiCapacity = z.infer<typeof csiCapacitySchema>;
export type CsiCapacityDetail = z.infer<typeof csiCapacityDetailSchema>;
