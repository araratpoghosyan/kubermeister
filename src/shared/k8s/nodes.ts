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
    pods: z.number().int().nonnegative(),
    age: z.string(),
    instanceType: z.string(),
});

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

/** The single-node view: the list fields plus conditions and system info. */
export const nodeDetailSchema = nodeSchema.extend({
    conditions: z.array(nodeConditionSchema),
    info: nodeInfoSchema,
});

export type Node = z.infer<typeof nodeSchema>;
export type NodeCondition = z.infer<typeof nodeConditionSchema>;
export type NodeInfo = z.infer<typeof nodeInfoSchema>;
export type NodeDetail = z.infer<typeof nodeDetailSchema>;
