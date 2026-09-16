import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/**
 * Admission: the objects that stand between a write and the cluster. Webhook configurations send
 * an object to somebody else's server to be changed or judged; a policy judges it in the API
 * server itself. Both decide what happens to writes nobody else can see going wrong.
 */

/** A configuration is Blocking when any of its webhooks fails closed, so a broken endpoint stops writes. */
export const webhookStatusSchema = z.enum(['Blocking', 'Permissive']);

export const webhookConfigSchema = z.object({
    name: z.string(),
    status: webhookStatusSchema,
    webhooks: z.number().int().nonnegative(),
    /** The webhook names it holds, joined, or a dash when it holds none. */
    webhookNames: z.string(),
    /** The failure policies in use, joined: one configuration may mix Fail and Ignore. */
    failurePolicy: z.string(),
    age: z.string(),
});
export const webhookConfigDetailSchema = webhookConfigSchema.extend({ labels: pairs, annotations: pairs });

export const admissionPolicySchema = z.object({
    name: z.string(),
    failurePolicy: z.string(),
    /** How many CEL expressions it checks, which is the size of the rule. */
    validations: z.number().int().nonnegative(),
    /** The resources it matches, as `group/resource` entries, or a dash for everything. */
    matches: z.string(),
    age: z.string(),
});
export const admissionPolicyDetailSchema = admissionPolicySchema.extend({ labels: pairs, annotations: pairs });

export type WebhookStatus = z.infer<typeof webhookStatusSchema>;
export type WebhookConfig = z.infer<typeof webhookConfigSchema>;
export type WebhookConfigDetail = z.infer<typeof webhookConfigDetailSchema>;
export type AdmissionPolicy = z.infer<typeof admissionPolicySchema>;
export type AdmissionPolicyDetail = z.infer<typeof admissionPolicyDetailSchema>;
