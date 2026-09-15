import { z } from 'zod';

const pairs = z.array(z.tuple([z.string(), z.string()]));

/** A load balancer without an address yet is still provisioning; everything else is serving. */
export const networkStatusSchema = z.enum(['Active', 'Pending']);

export const serviceSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    type: z.string(),
    status: networkStatusSchema,
    /** `None` for a headless service. */
    clusterIp: z.string(),
    externalIp: z.string(),
    /** Comma-joined `port/protocol` pairs, or an em-dash. */
    ports: z.string(),
    age: z.string(),
});
export const serviceDetailSchema = serviceSchema.extend({
    /** Label selector the service routes to, as ordered pairs. */
    selector: pairs,
    labels: pairs,
    annotations: pairs,
});

export const ingressSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    className: z.string(),
    status: networkStatusSchema,
    /** Comma-joined hosts, or `*` when every rule matches any host. */
    hosts: z.string(),
    address: z.string(),
    ports: z.string(),
    age: z.string(),
});
export const ingressDetailSchema = ingressSchema.extend({
    tls: z.array(z.object({ secretName: z.string(), hosts: z.string() })),
    /** cert-manager issuer annotation, when one is set. */
    issuer: z.string().optional(),
    labels: pairs,
    annotations: pairs,
});

export const endpointsSchema = z.object({
    name: z.string(),
    namespace: z.string(),
    /** The first addresses with their port, truncated with a "+N more" tail. */
    endpoints: z.string(),
    age: z.string(),
});
export const endpointsDetailSchema = endpointsSchema.extend({ labels: pairs, annotations: pairs });

export const networkPolicySchema = z.object({
    name: z.string(),
    namespace: z.string(),
    /** The pod selector, or `<all pods>` when the policy selects everything. */
    podSelector: z.string(),
    policyTypes: z.string(),
    age: z.string(),
});
export const networkPolicyDetailSchema = networkPolicySchema.extend({ labels: pairs, annotations: pairs });

export const servicePortSchema = z.object({
    name: z.string(),
    port: z.string(),
    protocol: z.string(),
    target: z.string(),
    appProtocol: z.string(),
});

export const endpointReadySchema = z.enum(['Ready', 'NotReady']);

export const serviceEndpointSchema = z.object({
    pod: z.string(),
    node: z.string(),
    address: z.string(),
    ready: endpointReadySchema,
});

export const ingressRuleSchema = z.object({
    host: z.string(),
    path: z.string(),
    backend: z.string(),
    port: z.string(),
});

export type NetworkStatus = z.infer<typeof networkStatusSchema>;
export type Service = z.infer<typeof serviceSchema>;
export type ServiceDetail = z.infer<typeof serviceDetailSchema>;
export type Ingress = z.infer<typeof ingressSchema>;
export type IngressDetail = z.infer<typeof ingressDetailSchema>;
export type Endpoints = z.infer<typeof endpointsSchema>;
export type EndpointsDetail = z.infer<typeof endpointsDetailSchema>;
export type NetworkPolicy = z.infer<typeof networkPolicySchema>;
export type NetworkPolicyDetail = z.infer<typeof networkPolicyDetailSchema>;
export type ServicePort = z.infer<typeof servicePortSchema>;
export type EndpointReady = z.infer<typeof endpointReadySchema>;
export type ServiceEndpoint = z.infer<typeof serviceEndpointSchema>;
export type IngressRule = z.infer<typeof ingressRuleSchema>;
