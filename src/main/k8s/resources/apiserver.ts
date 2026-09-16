import type { V1APIService, V1FlowSchema } from '@kubernetes/client-node';
import type {
    ApiService,
    ApiServiceDetail,
    ApiServiceStatus,
    FlowSchema,
    FlowSchemaDetail,
} from '../../../shared/k8s/apiserver.js';
import { apis, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { age, dash, toPairs } from '../format.js';

/*
 * The API server's own extension points: the APIs it serves for somebody else, and how it shares
 * itself out between callers. Pure transforms first, readers at the end.
 */

const availability = (service: V1APIService) =>
    (service.status?.conditions ?? []).find((condition) => condition.type === 'Available');

/** An aggregated API whose backing service is down reads Unavailable, which is why its kinds vanish. */
export function apiServiceStatus(service: V1APIService): ApiServiceStatus {
    return availability(service)?.status === 'True' ? 'Available' : 'Unavailable';
}

export function toApiService(service: V1APIService, now = Date.now()): ApiService {
    const backing = service.spec?.service;
    const condition = availability(service);
    return {
        name: service.metadata?.name ?? '',
        status: apiServiceStatus(service),
        // The core group has no name of its own; every aggregated API does.
        group: dash(service.spec?.group),
        version: dash(service.spec?.version),
        service: backing ? `${backing.namespace}/${backing.name}` : 'Local',
        reason: dash(condition?.status === 'True' ? undefined : (condition?.message ?? condition?.reason)),
        age: age(service.metadata?.creationTimestamp, now),
    };
}

export function toApiServiceDetail(service: V1APIService, now = Date.now()): ApiServiceDetail {
    return {
        ...toApiService(service, now),
        labels: toPairs(service.metadata?.labels),
        annotations: toPairs(service.metadata?.annotations),
    };
}

export function toFlowSchema(schema: V1FlowSchema, now = Date.now()): FlowSchema {
    return {
        name: schema.metadata?.name ?? '',
        priorityLevel: dash(schema.spec?.priorityLevelConfiguration?.name),
        // The API's own default when the field is left out, and what decides which schema wins.
        matchingPrecedence: schema.spec?.matchingPrecedence ?? 1000,
        distinguisher: dash(schema.spec?.distinguisherMethod?.type),
        age: age(schema.metadata?.creationTimestamp, now),
    };
}

export function toFlowSchemaDetail(schema: V1FlowSchema, now = Date.now()): FlowSchemaDetail {
    return {
        ...toFlowSchema(schema, now),
        labels: toPairs(schema.metadata?.labels),
        annotations: toPairs(schema.metadata?.annotations),
    };
}

export function listApiServices(): Promise<ApiService[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().apiregistration.listAPIService();
        return items.map((service) => toApiService(service));
    });
}

export function getApiService(name: string): Promise<ApiServiceDetail | null> {
    return withK8s('resources.get', async () => {
        const service = await readOrNull(() => apis().apiregistration.readAPIService({ name }));
        return service ? toApiServiceDetail(service) : null;
    });
}

export function listFlowSchemas(): Promise<FlowSchema[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().flowcontrol.listFlowSchema();
        return items.map((schema) => toFlowSchema(schema));
    });
}

export function getFlowSchema(name: string): Promise<FlowSchemaDetail | null> {
    return withK8s('resources.get', async () => {
        const schema = await readOrNull(() => apis().flowcontrol.readFlowSchema({ name }));
        return schema ? toFlowSchemaDetail(schema) : null;
    });
}
