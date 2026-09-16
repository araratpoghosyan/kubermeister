import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

/**
 * A flat reading of one object, in the shape `kubectl describe` prints: sections of labelled
 * values, with nested blocks for the parts that repeat (containers, conditions, volumes). It is a
 * view model rather than text, so the screen can lay it out and the same content can be copied.
 */

export const describeRowSchema = z.object({
    label: z.string(),
    value: z.string(),
});

export const describeBlockSchema = z.object({
    /** The block's own heading, e.g. a container's name. */
    title: z.string(),
    rows: z.array(describeRowSchema),
});

export const describeSectionSchema = z.object({
    title: z.string(),
    rows: z.array(describeRowSchema),
    blocks: z.array(describeBlockSchema),
});

export const describeDocumentSchema = z.object({
    kind: z.string(),
    name: z.string(),
    namespace: z.string().nullable(),
    sections: z.array(describeSectionSchema),
});

/** The kinds this view is written for; others keep the manifest, which says the same in YAML. */
export const describeKindSchema = z.enum(['Pod', 'Node']);

export const describeInputSchema = z.object({
    kind: describeKindSchema,
    name: z.string().min(1),
    /** Required for a pod, absent for a node, like every other per-object read. */
    namespace: namespaceNameSchema.optional(),
});

export type DescribeRow = z.infer<typeof describeRowSchema>;
export type DescribeBlock = z.infer<typeof describeBlockSchema>;
export type DescribeSection = z.infer<typeof describeSectionSchema>;
export type DescribeDocument = z.infer<typeof describeDocumentSchema>;
export type DescribeKind = z.infer<typeof describeKindSchema>;
export type DescribeInput = z.infer<typeof describeInputSchema>;

/** The document as the text `kubectl describe` would print, for copying and downloading. */
export function describeToText(document: DescribeDocument): string {
    const width = Math.max(
        ...document.sections.flatMap((section) => [
            ...section.rows.map((row) => row.label.length),
            ...section.blocks.flatMap((block) => block.rows.map((row) => row.label.length + 2)),
        ]),
        12,
    );
    const pad = (label: string, indent = 0) => `${' '.repeat(indent)}${label}:`.padEnd(width + 2);
    const lines: string[] = [];
    for (const section of document.sections) {
        lines.push(`${section.title}:`);
        for (const row of section.rows) lines.push(`  ${pad(row.label)}${row.value}`);
        for (const block of section.blocks) {
            lines.push(`  ${block.title}:`);
            for (const row of block.rows) lines.push(`    ${pad(row.label)}${row.value}`);
        }
        lines.push('');
    }
    return lines.join('\n').trimEnd() + '\n';
}
