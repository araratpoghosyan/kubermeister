import { z } from 'zod';
import { manifestKindSchema, refineManifestTarget } from './manifest.js';
import { namespaceNameSchema } from './names.js';
import { kindSchema, restartKindSchema } from './registry.js';

/** What a write reports back: enough to name the object in a toast and invalidate its screens. */
export const writeResultSchema = z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string().optional(),
});

/**
 * Every write names the context the screen believes is active. Main compares it with the context
 * it is really on and refuses a mismatch, so a write issued from rows that were rendered before a
 * context switch can never land in the cluster the switch moved to.
 */
const scopeStamp = { context: z.string().min(1) };

/** The object a manifest edit started from; a save whose manifest names anything else is refused. */
export const manifestIdentitySchema = z
    .object({
        kind: manifestKindSchema,
        name: z.string().min(1),
        namespace: namespaceNameSchema.optional(),
    })
    .superRefine(refineManifestTarget);

export const manifestWriteSchema = z.object({
    ...scopeStamp,
    manifest: z.string().min(1),
    /** Run the object through admission without persisting it. */
    dryRun: z.boolean().optional(),
    /** For a replace: the object being edited, pinned so the manifest cannot be aimed elsewhere. */
    expect: manifestIdentitySchema.optional(),
});

export const deleteInputSchema = z
    .object({
        ...scopeStamp,
        kind: manifestKindSchema,
        name: z.string().min(1),
        namespace: namespaceNameSchema.optional(),
    })
    .superRefine(refineManifestTarget);

export const scaleInputSchema = z
    .object({
        ...scopeStamp,
        kind: kindSchema,
        name: z.string().min(1),
        namespace: namespaceNameSchema.optional(),
        replicas: z.number().int().min(0).max(1000),
    })
    .superRefine(refineManifestTarget);

/**
 * A rollout restart. Every restartable kind is namespaced, so the screen must name the namespace it
 * rendered: the active selection is never consulted for a write that replaces running pods.
 */
export const restartInputSchema = z.object({
    ...scopeStamp,
    kind: restartKindSchema,
    name: z.string().min(1),
    namespace: namespaceNameSchema,
});

export type WriteResult = z.infer<typeof writeResultSchema>;
export type ManifestIdentity = z.infer<typeof manifestIdentitySchema>;
export type ManifestWrite = z.infer<typeof manifestWriteSchema>;
export type DeleteInput = z.infer<typeof deleteInputSchema>;
export type ScaleInput = z.infer<typeof scaleInputSchema>;
export type RestartInput = z.infer<typeof restartInputSchema>;
