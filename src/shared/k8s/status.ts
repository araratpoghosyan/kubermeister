import { z } from 'zod';

/** Per-domain status vocabularies the UI knows how to render. */
export const clusterStatusSchema = z.enum(['Healthy', 'Degraded']);
export const nodeStatusSchema = z.enum(['Ready', 'NotReady', 'Cordoned']);

export type ClusterStatus = z.infer<typeof clusterStatusSchema>;
export type NodeStatus = z.infer<typeof nodeStatusSchema>;
