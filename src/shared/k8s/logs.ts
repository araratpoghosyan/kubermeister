import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

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
    namespace: namespaceNameSchema,
    /** Defaults to the pod's first container. */
    container: z.string().min(1).optional(),
    sinceSeconds: z.number().int().positive().optional(),
    tailLines: z.number().int().positive().optional(),
    /** Read the logs of the previous run of this container, which is where a crash left its reason. */
    previous: z.boolean().optional(),
});
export type PodLogSnapshotInput = z.infer<typeof podLogSnapshotInputSchema>;

/**
 * A whole log, as text, for saving to a file. Capped in main rather than in the renderer: a
 * container that has been shouting for a week must not be pulled across the bridge in full.
 */
export const podLogDownloadInputSchema = podLogSnapshotInputSchema.omit({ tailLines: true });

export const podLogDownloadSchema = z.object({
    text: z.string(),
    /** True when the log was longer than the cap and the oldest lines were left behind. */
    truncated: z.boolean(),
});
export type PodLogDownloadInput = z.infer<typeof podLogDownloadInputSchema>;
export type PodLogDownload = z.infer<typeof podLogDownloadSchema>;
