import { z } from 'zod';
import { manifestKindSchema } from './manifest.js';
import { namespaceNameSchema } from './names.js';
import { ownerLinkSchema } from './owners.js';

/**
 * The parts of `metadata` every screen wants and no view model carries: who owns the object and
 * what is holding its deletion open. One channel serves every kind, rather than thirty detail
 * schemas each gaining the same two fields.
 */

export const objectMetaSchema = z.object({
    /** The controller above this object, or null for one nobody owns. */
    owner: ownerLinkSchema.nullable(),
    /**
     * Finalizers still registered on the object. A deleted object with any of these stays until
     * they are removed, which is the whole explanation for "stuck in Terminating".
     */
    finalizers: z.array(z.string()),
    /** Whether a deletion is already under way, which is when finalizers start to matter. */
    deleting: z.boolean(),
    /** Creation time as the API server stamped it, for the absolute time behind an age. */
    created: z.string(),
    uid: z.string(),
});

export const objectMetaInputSchema = z.object({
    kind: manifestKindSchema,
    name: z.string().min(1),
    namespace: namespaceNameSchema.optional(),
});

export type ObjectMeta = z.infer<typeof objectMetaSchema>;
export type ObjectMetaInput = z.infer<typeof objectMetaInputSchema>;
