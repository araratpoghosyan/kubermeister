import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * The class kinds: cluster-wide objects other objects point at by name. A pod names a RuntimeClass
 * to choose the container runtime that runs it; an Ingress names an IngressClass to choose the
 * controller that serves it. Both are cluster-scoped, and both answer "what happens to the objects
 * that ask for this one".
 */

export const runtimeClassSchema = z.object({
    name: z.string(),
    /** The CRI handler this class selects, which is the whole point of the object. */
    handler: z.string(),
    /** Nodes the class restricts its pods to, or a dash when it restricts none. */
    nodeSelector: z.string(),
    /** Per-pod overhead the scheduler adds for this runtime, as written. */
    overhead: z.string(),
    age: z.string(),
});
export const runtimeClassDetailSchema = runtimeClassSchema.extend({ labels: pairs, annotations: pairs });

export const ingressClassSchema = z.object({
    name: z.string(),
    controller: z.string(),
    /** The parameters object the controller reads, as `Kind/name`, or a dash. */
    parameters: z.string(),
    /** Whether an Ingress naming no class gets this one. */
    isDefault: z.boolean(),
    age: z.string(),
});
export const ingressClassDetailSchema = ingressClassSchema.extend({ labels: pairs, annotations: pairs });

export type RuntimeClass = z.infer<typeof runtimeClassSchema>;
export type RuntimeClassDetail = z.infer<typeof runtimeClassDetailSchema>;
export type IngressClass = z.infer<typeof ingressClassSchema>;
export type IngressClassDetail = z.infer<typeof ingressClassDetailSchema>;
