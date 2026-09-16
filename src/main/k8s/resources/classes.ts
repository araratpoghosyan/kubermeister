import type { V1IngressClass, V1RuntimeClass } from '@kubernetes/client-node';
import type {
    IngressClass,
    IngressClassDetail,
    RuntimeClass,
    RuntimeClassDetail,
} from '../../../shared/k8s/classes.js';
import { apis, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { age, dash, joinSelector, toPairs } from '../format.js';

/*
 * The class kinds other objects point at by name: a RuntimeClass picks the runtime a pod runs on,
 * an IngressClass the controller that serves an Ingress.
 */

/** The annotation that makes a class the one an Ingress naming none gets. */
const DEFAULT_CLASS_ANNOTATION = 'ingressclass.kubernetes.io/is-default-class';

export function toRuntimeClass(runtimeClass: V1RuntimeClass, now = Date.now()): RuntimeClass {
    const overhead = runtimeClass.overhead?.podFixed ?? {};
    return {
        name: runtimeClass.metadata?.name ?? '',
        handler: dash(runtimeClass.handler),
        nodeSelector: joinSelector(runtimeClass.scheduling?.nodeSelector, '—'),
        overhead: joinSelector(overhead, '—'),
        age: age(runtimeClass.metadata?.creationTimestamp, now),
    };
}

export function toRuntimeClassDetail(runtimeClass: V1RuntimeClass, now = Date.now()): RuntimeClassDetail {
    return {
        ...toRuntimeClass(runtimeClass, now),
        labels: toPairs(runtimeClass.metadata?.labels),
        annotations: toPairs(runtimeClass.metadata?.annotations),
    };
}

export function toIngressClass(ingressClass: V1IngressClass, now = Date.now()): IngressClass {
    const parameters = ingressClass.spec?.parameters;
    return {
        name: ingressClass.metadata?.name ?? '',
        controller: dash(ingressClass.spec?.controller),
        parameters: parameters ? `${parameters.kind}/${parameters.name}` : '—',
        isDefault: ingressClass.metadata?.annotations?.[DEFAULT_CLASS_ANNOTATION] === 'true',
        age: age(ingressClass.metadata?.creationTimestamp, now),
    };
}

export function toIngressClassDetail(ingressClass: V1IngressClass, now = Date.now()): IngressClassDetail {
    return {
        ...toIngressClass(ingressClass, now),
        labels: toPairs(ingressClass.metadata?.labels),
        annotations: toPairs(ingressClass.metadata?.annotations),
    };
}

export function listRuntimeClasses(): Promise<RuntimeClass[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().runtime.listRuntimeClass();
        return items.map((runtimeClass) => toRuntimeClass(runtimeClass));
    });
}

export function getRuntimeClass(name: string): Promise<RuntimeClassDetail | null> {
    return withK8s('resources.get', async () => {
        const runtimeClass = await readOrNull(() => apis().runtime.readRuntimeClass({ name }));
        return runtimeClass ? toRuntimeClassDetail(runtimeClass) : null;
    });
}

export function listIngressClasses(): Promise<IngressClass[]> {
    return withK8s('resources.list', async () => {
        const { items } = await apis().net.listIngressClass();
        return items.map((ingressClass) => toIngressClass(ingressClass));
    });
}

export function getIngressClass(name: string): Promise<IngressClassDetail | null> {
    return withK8s('resources.get', async () => {
        const ingressClass = await readOrNull(() => apis().net.readIngressClass({ name }));
        return ingressClass ? toIngressClassDetail(ingressClass) : null;
    });
}
