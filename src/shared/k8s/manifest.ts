import { z } from 'zod';
import { KINDS } from './registry.js';

/**
 * Kinds whose live manifest can be read. Nodes are not in the kind registry (they have bespoke
 * channels of their own) but their detail shows a manifest like every other object, so the
 * vocabulary is the registry's kinds plus Node.
 */
export const manifestKindSchema = z.enum([...KINDS, 'Node']);

export const manifestInputSchema = z.object({
    kind: manifestKindSchema,
    name: z.string().min(1),
    namespace: z.string().min(1).optional(),
});

export const manifestSchema = z.object({
    yaml: z.string(),
    kind: z.string(),
    namespace: z.string().optional(),
});

export type ManifestKind = z.infer<typeof manifestKindSchema>;
export type ManifestInput = z.infer<typeof manifestInputSchema>;
export type Manifest = z.infer<typeof manifestSchema>;
