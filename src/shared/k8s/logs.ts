import { z } from 'zod';

export const logLevelSchema = z.enum(['INFO', 'DEBUG', 'WARN', 'ERROR']);

/** One log line as streamed from a container, with the level guessed from its text. */
export const logLineSchema = z.object({
    level: logLevelSchema,
    /** RFC 3339 timestamp the API server prefixed, or empty when absent. */
    timestamp: z.string(),
    message: z.string(),
});

export type LogLevel = z.infer<typeof logLevelSchema>;
export type LogLine = z.infer<typeof logLineSchema>;

/** Input of the one-shot log read: the same target as the follow stream, plus its window. */
export const podLogSnapshotInputSchema = z.object({
    name: z.string().min(1),
    namespace: z.string().min(1),
    /** Defaults to the pod's first container. */
    container: z.string().min(1).optional(),
    sinceSeconds: z.number().int().positive().optional(),
    tailLines: z.number().int().positive().optional(),
});
export type PodLogSnapshotInput = z.infer<typeof podLogSnapshotInputSchema>;
