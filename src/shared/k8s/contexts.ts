import { z } from 'zod';

/** A kube-context entry from the loaded kubeconfig, plus whether it is the active one. */
export const kubeContextSchema = z.object({
    name: z.string(),
    cluster: z.string(),
    user: z.string(),
    /** The context's default namespace, if the kubeconfig sets one. */
    namespace: z.string().optional(),
    current: z.boolean(),
});

export type KubeContext = z.infer<typeof kubeContextSchema>;
