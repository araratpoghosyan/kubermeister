import { z } from 'zod';
import { namespaceNameSchema } from './names.js';

/**
 * The three ways into a running system that are not ordinary reads: a debug container attached to a
 * pod, a privileged pod that borrows a node, and files carried across the exec channel. Each names
 * its target explicitly and carries the context stamp every write carries.
 */

const target = {
    context: z.string().min(1),
    name: z.string().min(1),
    namespace: namespaceNameSchema,
};

/** An image a debug session may run: a reference, not a command line. */
const imageSchema = z
    .string()
    .min(1)
    .max(253)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._\-/:@]*$/, 'must be an image reference');

export const debugContainerInputSchema = z.object({
    ...target,
    image: imageSchema.optional(),
    /** The container whose process namespace the debugger joins; its own without one. */
    targetContainer: z.string().min(1).optional(),
});

export const debugSessionSchema = z.object({
    pod: z.string(),
    namespace: z.string(),
    container: z.string(),
});

export const nodeShellInputSchema = z.object({
    context: z.string().min(1),
    /** The node to open a shell onto. */
    name: z.string().min(1),
    /** Where the privileged pod is created; the user's choice, never assumed. */
    namespace: namespaceNameSchema,
    image: imageSchema.optional(),
});

/**
 * One file, one direction. The local side is never named by the renderer: main asks the user
 * through the OS picker, so a compromised renderer cannot read or write an arbitrary path.
 */
export const podFileInputSchema = z.object({
    ...target,
    container: z.string().min(1),
    /** The path inside the container: a file to fetch, or the directory to place one in. */
    remotePath: z.string().min(1).max(4096),
});

export const podCopyResultSchema = z.object({
    localPath: z.string(),
    remotePath: z.string(),
});

/** A copy the user called off at the file picker, which is not a failure. */
export const podCopyOutcomeSchema = podCopyResultSchema.nullable();

export type DebugContainerInput = z.infer<typeof debugContainerInputSchema>;
export type DebugContainerResult = z.infer<typeof debugSessionSchema>;
export type NodeShellInput = z.infer<typeof nodeShellInputSchema>;
export type NodeShellResult = z.infer<typeof debugSessionSchema>;
export type PodFileInput = z.infer<typeof podFileInputSchema>;
export type PodCopyResult = z.infer<typeof podCopyResultSchema>;
