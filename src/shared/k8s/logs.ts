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
