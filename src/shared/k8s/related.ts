import { z } from 'zod';
import { manifestKindSchema } from './manifest.js';
import { namespaceNameSchema } from './names.js';

/**
 * What else an object is tied to. Every link says *why* it is there — "mounted as a volume",
 * "selected by", "bound claim" — because a relation nobody can explain is a guess, and a guess on
 * a screen about someone's cluster is worse than a gap.
 */

export const relatedLinkSchema = z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string(),
    /** The screen for that object, or null when the app has no list for the kind. */
    path: z.string().nullable(),
    /** Why the two are related, in the API's own terms. */
    why: z.string(),
});

export const relatedGroupSchema = z.object({
    /** A heading people recognise: Services, Configuration, Storage, Access, Policy. */
    label: z.string(),
    items: z.array(relatedLinkSchema),
});

export const relatedInputSchema = z.object({
    kind: manifestKindSchema,
    name: z.string().min(1),
    namespace: namespaceNameSchema.optional(),
});

export type RelatedLink = z.infer<typeof relatedLinkSchema>;
export type RelatedGroup = z.infer<typeof relatedGroupSchema>;
