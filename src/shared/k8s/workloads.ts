import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * Display status derived from a Deployment's replica counts. Scaled to zero is a settled state and
 * reads Available rather than Progressing forever.
 */
export const deploymentStatusSchema = z.enum(['Available', 'Healthy', 'Progressing']);

export const deploymentSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    status: deploymentStatusSchema,
    /** Ready replicas over desired, e.g. "2/3". */
    ready: z.string(),
    replicas: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    available: z.number().int().nonnegative(),
    strategy: z.string(),
    /** First container image, or a dash. */
    image: z.string(),
    age: z.string(),
});
export const deploymentDetailSchema = deploymentSchema.extend({ labels: pairs, annotations: pairs });

export const statefulSetSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    ready: z.string(),
    replicas: z.number().int().nonnegative(),
    service: z.string(),
    image: z.string(),
    age: z.string(),
});
export const statefulSetDetailSchema = statefulSetSchema.extend({ labels: pairs, annotations: pairs });

export const daemonSetSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    desired: z.number().int().nonnegative(),
    current: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    upToDate: z.number().int().nonnegative(),
    nodeSelector: z.string(),
    age: z.string(),
});
export const daemonSetDetailSchema = daemonSetSchema.extend({ labels: pairs, annotations: pairs });

export const rolloutStateSchema = z.enum(['Current', 'Superseded']);

/** One revision of a Deployment, synthesised from an owned ReplicaSet. */
export const rolloutSchema = z.object({
    /** Revision number, e.g. "3". */
    rev: z.string(),
    state: rolloutStateSchema,
    image: z.string(),
    /** The change-cause annotation, or a dash. */
    by: z.string(),
    when: z.string(),
    duration: z.string(),
});

export const replicaSetSchema = z.object({
    name: z.string(),
    desired: z.number().int().nonnegative(),
    current: z.number().int().nonnegative(),
    ready: z.number().int().nonnegative(),
    age: z.string(),
});

export const namespacedNameSchema = z.object({ name: z.string().min(1), namespace: z.string().min(1) });

export type DeploymentStatus = z.infer<typeof deploymentStatusSchema>;
export type Deployment = z.infer<typeof deploymentSchema>;
export type DeploymentDetail = z.infer<typeof deploymentDetailSchema>;
export type StatefulSet = z.infer<typeof statefulSetSchema>;
export type StatefulSetDetail = z.infer<typeof statefulSetDetailSchema>;
export type DaemonSet = z.infer<typeof daemonSetSchema>;
export type DaemonSetDetail = z.infer<typeof daemonSetDetailSchema>;
export type RolloutState = z.infer<typeof rolloutStateSchema>;
export type Rollout = z.infer<typeof rolloutSchema>;
export type ReplicaSet = z.infer<typeof replicaSetSchema>;
export type NamespacedName = z.infer<typeof namespacedNameSchema>;
