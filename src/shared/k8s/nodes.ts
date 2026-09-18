import { z } from 'zod';
import { nodeStatusSchema } from './status.js';

export const nodeSchema = z.object({
    name: z.string(),
    status: nodeStatusSchema,
    /** Comma-joined roles from `node-role.kubernetes.io/*` labels, or `worker`. */
    role: z.string(),
    /** Kubelet version, or an em-dash. */
    version: z.string(),
    /** Allocatable CPU in whole cores; 0 when unreadable. */
    cpu: z.number(),
    /** Allocatable memory in GiB with one decimal; 0 when unreadable. */
    memory: z.number(),
    /** CPU usage as a percentage of allocatable; null until metrics-server has reported the node. */
    cpuUsed: z.number().nullable(),
    /** Memory usage as a percentage of allocatable; null until metrics-server has reported the node. */
    memUsed: z.number().nullable(),
    age: z.string(),
    instanceType: z.string(),
});

/**
 * Pods scheduled per node name, from one cluster-wide pod list. It travels apart from the node
 * list, which is a few kilobytes, so the Nodes screen renders before the count arrives.
 */
export const nodePodCountsSchema = z.record(z.string(), z.number().int().nonnegative());

export const nodeConditionSchema = z.object({
    type: z.string(),
    status: z.string(),
    reason: z.string().optional(),
});

export const nodeInfoSchema = z.object({
    os: z.string(),
    kernel: z.string(),
    containerRuntime: z.string(),
    kubeletVersion: z.string(),
    architecture: z.string(),
});

/** The single-node view: the list fields plus its pod count, conditions and system info. */
export const nodeDetailSchema = nodeSchema.extend({
    /** Pods scheduled on this node, counted with a server-side selector on `spec.nodeName`. */
    pods: z.number().int().nonnegative(),
    conditions: z.array(nodeConditionSchema),
    info: nodeInfoSchema,
    labels: z.array(z.tuple([z.string(), z.string()])),
    annotations: z.array(z.tuple([z.string(), z.string()])),
});

export type Node = z.infer<typeof nodeSchema>;
export type NodePodCounts = z.infer<typeof nodePodCountsSchema>;
export type NodeCondition = z.infer<typeof nodeConditionSchema>;
export type NodeInfo = z.infer<typeof nodeInfoSchema>;
export type NodeDetail = z.infer<typeof nodeDetailSchema>;
