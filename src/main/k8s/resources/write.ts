import type { KubernetesObject, V1Scale } from '@kubernetes/client-node';
import { load as loadYaml } from 'js-yaml';
import type { ManifestKind } from '../../../shared/k8s/manifest.js';
import { KINDS, KIND_REGISTRY, type Kind } from '../../../shared/k8s/registry.js';
import type { WriteResult } from '../../../shared/k8s/write.js';
import { apis, getActiveNamespace, resolveObjectNamespace } from '../client.js';
import { K8sError, withK8s } from '../errors.js';

/*
 * The write path. Creates and replaces go through the generic object client, which derives the API
 * path from the manifest's own apiVersion and kind, so a custom resource rides the same call as a
 * Pod. Deletes and scales are addressed by kind instead, since there is no manifest to read it from.
 */

/**
 * Cluster-scoped kinds the app does not model but a user may still apply from the editor. Unioned
 * with the registry's own, so the two can never disagree about a kind both know.
 */
const EXTRA_CLUSTER_SCOPED_KINDS = [
    'APIService',
    'CSIDriver',
    'CSINode',
    'IngressClass',
    'MutatingWebhookConfiguration',
    'Namespace',
    'PriorityClass',
    'RuntimeClass',
    'ValidatingWebhookConfiguration',
    'VolumeAttachment',
    'VolumeSnapshotClass',
];

/**
 * Kinds whose objects live outside any namespace. A manifest that omits one is given the active
 * namespace, but never for these, where a namespace would mean nothing.
 */
export const CLUSTER_SCOPED_KINDS = new Set([
    ...KINDS.filter((kind) => KIND_REGISTRY[kind].clusterScoped),
    ...EXTRA_CLUSTER_SCOPED_KINDS,
]);

/** Parse a single-document manifest, rejecting anything unusable before the cluster sees it. */
export function parseManifest(manifestYaml: string, op: string): KubernetesObject {
    let parsed: unknown;
    try {
        parsed = loadYaml(manifestYaml);
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new K8sError('invalid', `The manifest is not valid YAML: ${reason}`, op);
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new K8sError('invalid', 'The manifest must be a single YAML object.', op);
    }
    const obj = parsed as KubernetesObject;
    if (!obj.apiVersion || !obj.kind) {
        throw new K8sError('invalid', 'The manifest must declare apiVersion and kind.', op);
    }
    if (!obj.metadata?.name && !obj.metadata?.generateName) {
        throw new K8sError('invalid', 'The manifest must declare metadata.name.', op);
    }
    return obj;
}

function applyActiveNamespace(spec: KubernetesObject): void {
    if (spec.metadata!.namespace || CLUSTER_SCOPED_KINDS.has(spec.kind!)) return;
    const active = getActiveNamespace();
    if (active) spec.metadata!.namespace = active;
}

/**
 * Create one object from a manifest. A dry run puts the object through the full admission chain and
 * persists nothing, which is how the editor checks a manifest before writing it.
 */
export function createResource(manifestYaml: string, dryRun?: boolean): Promise<WriteResult> {
    const op = 'resources.create';
    return withK8s(op, async () => {
        const spec = parseManifest(manifestYaml, op);
        applyActiveNamespace(spec);
        const created = await apis().objects.create(spec, undefined, dryRun ? 'All' : undefined);
        return {
            kind: created.kind ?? spec.kind!,
            name: created.metadata?.name ?? spec.metadata!.name ?? '',
            namespace: created.metadata?.namespace ?? spec.metadata!.namespace,
        };
    });
}

/**
 * Replace one object from a manifest. The manifest must carry the resource version it was read
 * with: that is what turns a concurrent change into a rejection instead of a silent overwrite.
 */
export function replaceResource(manifestYaml: string, dryRun?: boolean): Promise<WriteResult> {
    const op = 'resources.replace';
    return withK8s(op, async () => {
        const spec = parseManifest(manifestYaml, op);
        if (!spec.metadata?.name) {
            throw new K8sError('invalid', 'The manifest must declare metadata.name.', op);
        }
        if (!spec.metadata.resourceVersion) {
            throw new K8sError(
                'invalid',
                'The manifest must carry metadata.resourceVersion. Reload the object before saving.',
                op,
            );
        }
        applyActiveNamespace(spec);
        const updated = await apis().objects.replace(spec, undefined, dryRun ? 'All' : undefined);
        return {
            kind: updated.kind ?? spec.kind!,
            name: updated.metadata?.name ?? spec.metadata.name,
            namespace: updated.metadata?.namespace ?? spec.metadata.namespace,
        };
    });
}

const NODE_FACTS = { apiVersion: 'v1', kind: 'Node', clusterScoped: true };

function factsFor(kind: ManifestKind): { apiVersion: string; kind: string; clusterScoped: boolean } {
    if (kind === 'Node') return NODE_FACTS;
    const info = KIND_REGISTRY[kind];
    return { apiVersion: info.apiVersion, kind: info.kind, clusterScoped: info.clusterScoped };
}

/**
 * Delete one object. Destructive writes fail closed on their target: a namespaced kind is deleted
 * only in one concrete namespace, resolved from the caller or the active selection. With neither,
 * the request is refused rather than guessing which same-named object across the cluster was meant.
 */
export function deleteResource(kind: ManifestKind, name: string, namespace?: string): Promise<WriteResult> {
    const op = 'resources.delete';
    return withK8s(op, async () => {
        const facts = factsFor(kind);
        let target: string | undefined;
        if (!facts.clusterScoped) {
            target = resolveObjectNamespace(namespace) ?? undefined;
            if (!target)
                throw new K8sError('invalid', `A namespace is required to delete ${facts.kind} "${name}".`, op);
        }
        await apis().objects.delete({
            apiVersion: facts.apiVersion,
            kind: facts.kind,
            metadata: { name, namespace: target },
        });
        return { kind: facts.kind, name, namespace: target };
    });
}

interface ScaleOps {
    read: (name: string, namespace: string) => Promise<V1Scale>;
    replace: (name: string, namespace: string, body: V1Scale) => Promise<V1Scale>;
}

/** The scale subresource of each kind the registry marks scalable; read lazily so a context switch is honoured. */
const SCALERS: Partial<Record<Kind, ScaleOps>> = {
    Deployment: {
        read: (name, namespace) => apis().apps.readNamespacedDeploymentScale({ name, namespace }),
        replace: (name, namespace, body) => apis().apps.replaceNamespacedDeploymentScale({ name, namespace, body }),
    },
    StatefulSet: {
        read: (name, namespace) => apis().apps.readNamespacedStatefulSetScale({ name, namespace }),
        replace: (name, namespace, body) => apis().apps.replaceNamespacedStatefulSetScale({ name, namespace, body }),
    },
};

/**
 * Scale one object: read the current scale for its resource version, set the desired count and put
 * it back, so a concurrent change is rejected rather than lost. The namespace fails closed as a
 * delete does; both scalable kinds are namespaced.
 */
export function scaleResource(kind: Kind, name: string, replicas: number, namespace?: string): Promise<WriteResult> {
    const op = 'resources.scale';
    return withK8s(op, async () => {
        const info = KIND_REGISTRY[kind];
        const ops = SCALERS[kind];
        if (!info.scalable || !ops) throw new K8sError('invalid', `${info.kind} cannot be scaled.`, op);

        const target = resolveObjectNamespace(namespace) ?? undefined;
        if (!target) throw new K8sError('invalid', `A namespace is required to scale ${info.kind} "${name}".`, op);

        const scale = await ops.read(name, target);
        scale.spec = { ...(scale.spec ?? {}), replicas };
        await ops.replace(name, target, scale);
        return { kind: info.kind, name, namespace: target };
    });
}
