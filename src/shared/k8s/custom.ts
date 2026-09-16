import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * Instances of a custom resource definition. The app cannot know these kinds in advance, so a
 * custom resource is read through the definition that describes it: its columns come from the
 * CRD's own `additionalPrinterColumns`, which is what `kubectl get` prints, rather than from
 * anything this app decides a row should look like.
 */

export const customColumnSchema = z.object({
    name: z.string(),
    /** The JSONPath the definition gives, kept so the renderer can key cells by it. */
    jsonPath: z.string(),
    /** `integer`, `number`, `boolean`, `string` or `date`, as the definition declares it. */
    type: z.string(),
});

export const customResourceRowSchema = z.object({
    name: z.string(),
    /** Empty for an instance of a cluster-scoped definition. */
    namespace: z.string(),
    age: z.string(),
    /** One rendered value per printer column, keyed by that column's JSONPath. */
    cells: z.record(z.string(), z.string()),
});
export const customResourceDetailSchema = customResourceRowSchema.extend({ labels: pairs, annotations: pairs });

export const customResourceListOutputSchema = z.object({
    /** The kind as the definition names it, for the screen's own heading. */
    kind: z.string(),
    /** Whether instances live in namespaces, which decides how a detail is addressed. */
    namespaced: z.boolean(),
    columns: z.array(customColumnSchema),
    items: z.array(customResourceRowSchema),
});

export const customResourceListInputSchema = z.object({
    /** The definition's own name, e.g. `widgets.example.com`. */
    crd: z.string().min(1),
    namespace: namespaceNameSchema.optional(),
});

export const customResourceGetInputSchema = customResourceListInputSchema.extend({ name: z.string().min(1) });

export const customResourceGetOutputSchema = z.object({
    kind: z.string(),
    namespaced: z.boolean(),
    columns: z.array(customColumnSchema),
    item: customResourceDetailSchema.nullable(),
});

export type CustomColumn = z.infer<typeof customColumnSchema>;
export type CustomResourceRow = z.infer<typeof customResourceRowSchema>;
export type CustomResourceDetail = z.infer<typeof customResourceDetailSchema>;
export type CustomResourceListOutput = z.infer<typeof customResourceListOutputSchema>;
export type CustomResourceGetOutput = z.infer<typeof customResourceGetOutputSchema>;
export type CustomResourceListInput = z.infer<typeof customResourceListInputSchema>;
export type CustomResourceGetInput = z.infer<typeof customResourceGetInputSchema>;
