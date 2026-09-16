import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * The API server's own extension points: which APIs it serves on behalf of somebody else, and how
 * it shares itself out between callers. Both are cluster-scoped, and both explain behaviour that
 * otherwise looks like the cluster misbehaving.
 */

export const apiServiceStatusSchema = z.enum(['Available', 'Unavailable']);

export const apiServiceSchema = z.object({
    name: z.string(),
    status: apiServiceStatusSchema,
    group: z.string(),
    version: z.string(),
    /** The service backing it as `namespace/name`, or "Local" for an API the server serves itself. */
    service: z.string(),
    /** The reason the API server gives when it is unavailable, or a dash. */
    reason: z.string(),
    age: z.string(),
});
export const apiServiceDetailSchema = apiServiceSchema.extend({ labels: pairs, annotations: pairs });

export const flowSchemaSchema = z.object({
    name: z.string(),
    /** The priority level configuration this schema sends its requests to. */
    priorityLevel: z.string(),
    /** Lower wins: the first schema that matches a request decides its level. */
    matchingPrecedence: z.number().int(),
    /** How requests are told apart within the level: ByUser, ByNamespace, or a dash. */
    distinguisher: z.string(),
    age: z.string(),
});
export const flowSchemaDetailSchema = flowSchemaSchema.extend({ labels: pairs, annotations: pairs });

export type ApiServiceStatus = z.infer<typeof apiServiceStatusSchema>;
export type ApiService = z.infer<typeof apiServiceSchema>;
export type ApiServiceDetail = z.infer<typeof apiServiceDetailSchema>;
export type FlowSchema = z.infer<typeof flowSchemaSchema>;
export type FlowSchemaDetail = z.infer<typeof flowSchemaDetailSchema>;
