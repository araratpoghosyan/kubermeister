import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

export const serviceAccountSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    /** Secrets the account references; zero on clusters that mint tokens on demand. */
    secrets: z.number().int().nonnegative(),
    age: z.string(),
});
export const serviceAccountDetailSchema = serviceAccountSchema.extend({ labels: pairs, annotations: pairs });

export const roleSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    rules: z.number().int().nonnegative(),
    age: z.string(),
});
export const roleDetailSchema = roleSchema.extend({ labels: pairs, annotations: pairs });

export const roleBindingSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    /** The bound role as `Kind/name`. */
    role: z.string(),
    subjects: z.number().int().nonnegative(),
    age: z.string(),
});
export const roleBindingDetailSchema = roleBindingSchema.extend({ labels: pairs, annotations: pairs });

export const clusterRoleSchema = z.object({
    name: z.string(),
    rules: z.number().int().nonnegative(),
    /** True when the role's rules are assembled from other roles by an aggregation selector. */
    aggregated: z.boolean(),
    age: z.string(),
});
export const clusterRoleDetailSchema = clusterRoleSchema.extend({ labels: pairs, annotations: pairs });

export const clusterRoleBindingSchema = z.object({
    name: z.string(),
    role: z.string(),
    subjects: z.number().int().nonnegative(),
    age: z.string(),
});
export const clusterRoleBindingDetailSchema = clusterRoleBindingSchema.extend({ labels: pairs, annotations: pairs });

export type ServiceAccount = z.infer<typeof serviceAccountSchema>;
export type ServiceAccountDetail = z.infer<typeof serviceAccountDetailSchema>;
export type Role = z.infer<typeof roleSchema>;
export type RoleDetail = z.infer<typeof roleDetailSchema>;
export type RoleBinding = z.infer<typeof roleBindingSchema>;
export type RoleBindingDetail = z.infer<typeof roleBindingDetailSchema>;
export type ClusterRole = z.infer<typeof clusterRoleSchema>;
export type ClusterRoleDetail = z.infer<typeof clusterRoleDetailSchema>;
export type ClusterRoleBinding = z.infer<typeof clusterRoleBindingSchema>;
export type ClusterRoleBindingDetail = z.infer<typeof clusterRoleBindingDetailSchema>;
