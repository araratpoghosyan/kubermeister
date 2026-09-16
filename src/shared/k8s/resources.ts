import { z } from 'zod';
import { podDetailSchema, podSchema } from './pods.js';
import {
    endpointsDetailSchema,
    endpointsSchema,
    ingressDetailSchema,
    ingressSchema,
    networkPolicyDetailSchema,
    networkPolicySchema,
    serviceDetailSchema,
    serviceSchema,
} from './network.js';
import { customResourceDetailSchema, customResourceSchema } from './addons.js';
import {
    admissionPolicyDetailSchema,
    admissionPolicySchema,
    webhookConfigDetailSchema,
    webhookConfigSchema,
} from './admission.js';
import { apiServiceDetailSchema, apiServiceSchema, flowSchemaDetailSchema, flowSchemaSchema } from './apiserver.js';
import {
    ingressClassDetailSchema,
    ingressClassSchema,
    runtimeClassDetailSchema,
    runtimeClassSchema,
} from './classes.js';
import {
    csiCapacityDetailSchema,
    csiCapacitySchema,
    csiDriverDetailSchema,
    csiDriverSchema,
    csiNodeDetailSchema,
    csiNodeSchema,
} from './csi.js';
import {
    leaseDetailSchema,
    leaseSchema,
    podDisruptionBudgetDetailSchema,
    podDisruptionBudgetSchema,
    priorityClassDetailSchema,
    priorityClassSchema,
} from './policy.js';
import {
    clusterRoleBindingDetailSchema,
    clusterRoleBindingSchema,
    clusterRoleDetailSchema,
    clusterRoleSchema,
    roleBindingDetailSchema,
    roleBindingSchema,
    roleDetailSchema,
    roleSchema,
    serviceAccountDetailSchema,
    serviceAccountSchema,
} from './access.js';
import { kindSchema } from './registry.js';
import { labelSelectorSchema } from './selectors.js';
import { namespaceNameSchema } from './names.js';
import {
    claimDetailSchema,
    claimSchema,
    snapshotDetailSchema,
    snapshotSchema,
    storageClassDetailSchema,
    storageClassSchema,
    volumeDetailSchema,
    volumeSchema,
} from './storage.js';
import {
    autoscalerDetailSchema,
    autoscalerSchema,
    configMapDetailSchema,
    configMapSchema,
    cronJobDetailSchema,
    cronJobSchema,
    daemonSetDetailSchema,
    daemonSetSchema,
    deploymentDetailSchema,
    deploymentSchema,
    jobDetailSchema,
    jobSchema,
    replicaSetDetailSchema,
    replicaSetRowSchema,
    secretDetailSchema,
    secretSchema,
    statefulSetDetailSchema,
    statefulSetSchema,
} from './workloads.js';

/**
 * The generic resource channels. One `resources.list` and one `resources.get` serve every kind;
 * the output is a discriminated union on `kind`, so each kind keeps a precise view-model type
 * while the channel count stays flat.
 */
export const resourceListInputSchema = z.object({
    kind: kindSchema,
    /** Omitted: the active namespace, or all namespaces when none is selected. */
    namespace: namespaceNameSchema.optional(),
    /**
     * A label selector the API server applies, so the same filter narrows the watch behind the list
     * and a namespace with more objects than one page still filters correctly.
     */
    labelSelector: labelSelectorSchema.optional(),
});

export const resourceGetInputSchema = z.object({
    kind: kindSchema,
    name: z.string().min(1),
    /** Omitted: the active namespace; a namespaced kind with none selected reads as not found. */
    namespace: namespaceNameSchema.optional(),
});

export const resourceListOutputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('Pod'), items: z.array(podSchema) }),
    z.object({ kind: z.literal('Deployment'), items: z.array(deploymentSchema) }),
    z.object({ kind: z.literal('StatefulSet'), items: z.array(statefulSetSchema) }),
    z.object({ kind: z.literal('DaemonSet'), items: z.array(daemonSetSchema) }),
    z.object({ kind: z.literal('ReplicaSet'), items: z.array(replicaSetRowSchema) }),
    z.object({ kind: z.literal('ReplicationController'), items: z.array(replicaSetRowSchema) }),
    z.object({ kind: z.literal('Job'), items: z.array(jobSchema) }),
    z.object({ kind: z.literal('CronJob'), items: z.array(cronJobSchema) }),
    z.object({ kind: z.literal('HorizontalPodAutoscaler'), items: z.array(autoscalerSchema) }),
    z.object({ kind: z.literal('PodDisruptionBudget'), items: z.array(podDisruptionBudgetSchema) }),
    z.object({ kind: z.literal('PriorityClass'), items: z.array(priorityClassSchema) }),
    z.object({ kind: z.literal('Lease'), items: z.array(leaseSchema) }),
    z.object({ kind: z.literal('RuntimeClass'), items: z.array(runtimeClassSchema) }),
    z.object({ kind: z.literal('ConfigMap'), items: z.array(configMapSchema) }),
    z.object({ kind: z.literal('Secret'), items: z.array(secretSchema) }),
    z.object({ kind: z.literal('Service'), items: z.array(serviceSchema) }),
    z.object({ kind: z.literal('Ingress'), items: z.array(ingressSchema) }),
    z.object({ kind: z.literal('Endpoints'), items: z.array(endpointsSchema) }),
    z.object({ kind: z.literal('NetworkPolicy'), items: z.array(networkPolicySchema) }),
    z.object({ kind: z.literal('IngressClass'), items: z.array(ingressClassSchema) }),
    z.object({ kind: z.literal('PersistentVolume'), items: z.array(volumeSchema) }),
    z.object({ kind: z.literal('PersistentVolumeClaim'), items: z.array(claimSchema) }),
    z.object({ kind: z.literal('StorageClass'), items: z.array(storageClassSchema) }),
    z.object({ kind: z.literal('VolumeSnapshot'), items: z.array(snapshotSchema) }),
    z.object({ kind: z.literal('CSIDriver'), items: z.array(csiDriverSchema) }),
    z.object({ kind: z.literal('CSINode'), items: z.array(csiNodeSchema) }),
    z.object({ kind: z.literal('CSIStorageCapacity'), items: z.array(csiCapacitySchema) }),
    z.object({ kind: z.literal('ServiceAccount'), items: z.array(serviceAccountSchema) }),
    z.object({ kind: z.literal('Role'), items: z.array(roleSchema) }),
    z.object({ kind: z.literal('RoleBinding'), items: z.array(roleBindingSchema) }),
    z.object({ kind: z.literal('ClusterRole'), items: z.array(clusterRoleSchema) }),
    z.object({ kind: z.literal('ClusterRoleBinding'), items: z.array(clusterRoleBindingSchema) }),
    z.object({ kind: z.literal('MutatingWebhookConfiguration'), items: z.array(webhookConfigSchema) }),
    z.object({ kind: z.literal('ValidatingWebhookConfiguration'), items: z.array(webhookConfigSchema) }),
    z.object({ kind: z.literal('ValidatingAdmissionPolicy'), items: z.array(admissionPolicySchema) }),
    z.object({ kind: z.literal('APIService'), items: z.array(apiServiceSchema) }),
    z.object({ kind: z.literal('FlowSchema'), items: z.array(flowSchemaSchema) }),
    z.object({ kind: z.literal('CustomResourceDefinition'), items: z.array(customResourceSchema) }),
]);

export const resourceGetOutputSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('Pod'), item: podDetailSchema.nullable() }),
    z.object({ kind: z.literal('Deployment'), item: deploymentDetailSchema.nullable() }),
    z.object({ kind: z.literal('StatefulSet'), item: statefulSetDetailSchema.nullable() }),
    z.object({ kind: z.literal('DaemonSet'), item: daemonSetDetailSchema.nullable() }),
    z.object({ kind: z.literal('ReplicaSet'), item: replicaSetDetailSchema.nullable() }),
    z.object({ kind: z.literal('ReplicationController'), item: replicaSetDetailSchema.nullable() }),
    z.object({ kind: z.literal('Job'), item: jobDetailSchema.nullable() }),
    z.object({ kind: z.literal('CronJob'), item: cronJobDetailSchema.nullable() }),
    z.object({ kind: z.literal('HorizontalPodAutoscaler'), item: autoscalerDetailSchema.nullable() }),
    z.object({ kind: z.literal('PodDisruptionBudget'), item: podDisruptionBudgetDetailSchema.nullable() }),
    z.object({ kind: z.literal('PriorityClass'), item: priorityClassDetailSchema.nullable() }),
    z.object({ kind: z.literal('Lease'), item: leaseDetailSchema.nullable() }),
    z.object({ kind: z.literal('RuntimeClass'), item: runtimeClassDetailSchema.nullable() }),
    z.object({ kind: z.literal('ConfigMap'), item: configMapDetailSchema.nullable() }),
    z.object({ kind: z.literal('Secret'), item: secretDetailSchema.nullable() }),
    z.object({ kind: z.literal('Service'), item: serviceDetailSchema.nullable() }),
    z.object({ kind: z.literal('Ingress'), item: ingressDetailSchema.nullable() }),
    z.object({ kind: z.literal('Endpoints'), item: endpointsDetailSchema.nullable() }),
    z.object({ kind: z.literal('NetworkPolicy'), item: networkPolicyDetailSchema.nullable() }),
    z.object({ kind: z.literal('IngressClass'), item: ingressClassDetailSchema.nullable() }),
    z.object({ kind: z.literal('PersistentVolume'), item: volumeDetailSchema.nullable() }),
    z.object({ kind: z.literal('PersistentVolumeClaim'), item: claimDetailSchema.nullable() }),
    z.object({ kind: z.literal('StorageClass'), item: storageClassDetailSchema.nullable() }),
    z.object({ kind: z.literal('VolumeSnapshot'), item: snapshotDetailSchema.nullable() }),
    z.object({ kind: z.literal('CSIDriver'), item: csiDriverDetailSchema.nullable() }),
    z.object({ kind: z.literal('CSINode'), item: csiNodeDetailSchema.nullable() }),
    z.object({ kind: z.literal('CSIStorageCapacity'), item: csiCapacityDetailSchema.nullable() }),
    z.object({ kind: z.literal('ServiceAccount'), item: serviceAccountDetailSchema.nullable() }),
    z.object({ kind: z.literal('Role'), item: roleDetailSchema.nullable() }),
    z.object({ kind: z.literal('RoleBinding'), item: roleBindingDetailSchema.nullable() }),
    z.object({ kind: z.literal('ClusterRole'), item: clusterRoleDetailSchema.nullable() }),
    z.object({ kind: z.literal('ClusterRoleBinding'), item: clusterRoleBindingDetailSchema.nullable() }),
    z.object({ kind: z.literal('MutatingWebhookConfiguration'), item: webhookConfigDetailSchema.nullable() }),
    z.object({ kind: z.literal('ValidatingWebhookConfiguration'), item: webhookConfigDetailSchema.nullable() }),
    z.object({ kind: z.literal('ValidatingAdmissionPolicy'), item: admissionPolicyDetailSchema.nullable() }),
    z.object({ kind: z.literal('APIService'), item: apiServiceDetailSchema.nullable() }),
    z.object({ kind: z.literal('FlowSchema'), item: flowSchemaDetailSchema.nullable() }),
    z.object({ kind: z.literal('CustomResourceDefinition'), item: customResourceDetailSchema.nullable() }),
]);

export type ResourceListInput = z.infer<typeof resourceListInputSchema>;
export type ResourceGetInput = z.infer<typeof resourceGetInputSchema>;
export type ResourceListOutput = z.infer<typeof resourceListOutputSchema>;
export type ResourceGetOutput = z.infer<typeof resourceGetOutputSchema>;

/** The row type for a kind, recovered from the list output union. */
export type RowOf<K extends ResourceListOutput['kind']> = Extract<ResourceListOutput, { kind: K }>['items'][number];
/** The detail type for a kind, recovered from the get output union. */
export type DetailOf<K extends ResourceGetOutput['kind']> = NonNullable<
    Extract<ResourceGetOutput, { kind: K }>['item']
>;
