import { z } from 'zod';
import { manifestKindSchema } from './manifest.js';
import { kindSchema } from './registry.js';

/** What a write reports back: enough to name the object in a toast and invalidate its screens. */
export const writeResultSchema = z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string().optional(),
});

export const manifestWriteSchema = z.object({
    manifest: z.string().min(1),
    /** Run the object through admission without persisting it. */
    dryRun: z.boolean().optional(),
});

export const deleteInputSchema = z.object({
    kind: manifestKindSchema,
    name: z.string().min(1),
    namespace: z.string().min(1).optional(),
});

export const scaleInputSchema = z.object({
    kind: kindSchema,
    name: z.string().min(1),
    namespace: z.string().min(1).optional(),
    replicas: z.number().int().min(0).max(1000),
});

export type WriteResult = z.infer<typeof writeResultSchema>;
export type ManifestWrite = z.infer<typeof manifestWriteSchema>;
export type DeleteInput = z.infer<typeof deleteInputSchema>;
export type ScaleInput = z.infer<typeof scaleInputSchema>;
