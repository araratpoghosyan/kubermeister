import { dump as dumpYaml } from 'js-yaml';

/*
 * Plain js-yaml, never the client library's own dump: that one reserializes through its typed
 * models and silently drops fields it does not know, which for a CRD or a newer API field means the
 * manifest on screen is not the object in the cluster.
 */

/**
 * Serialize a Kubernetes object the way `kubectl get -o yaml` prints it. Server-managed noise is
 * stripped, but `resourceVersion` and `status` stay: the first is what lets a later write be
 * conflict-checked, and the second is what a reader came to look at.
 */
export function yamlToText(obj: object): string {
    return dumpYaml(orderTypeMeta(stripNoise(obj)), { lineWidth: -1, noRefs: true, sortKeys: false });
}

/**
 * Hoist apiVersion and kind to the top. A read omits both, so callers append them as fallbacks and
 * they would otherwise serialize last, where no one expects them.
 */
function orderTypeMeta<T extends object>(obj: T): T {
    const { apiVersion, kind, ...rest } = obj as Record<string, unknown>;
    const ordered: Record<string, unknown> = {};
    if (apiVersion !== undefined) ordered.apiVersion = apiVersion;
    if (kind !== undefined) ordered.kind = kind;
    return { ...ordered, ...rest } as T;
}

const LAST_APPLIED = 'kubectl.kubernetes.io/last-applied-configuration';

interface CleanableMeta {
    metadata?: { managedFields?: unknown; annotations?: Record<string, string> };
}

function stripNoise<T extends object>(obj: T): T {
    const clone = structuredClone(obj) as T & CleanableMeta;
    if (clone.metadata) {
        delete clone.metadata.managedFields;
        delete clone.metadata.annotations?.[LAST_APPLIED];
        if (clone.metadata.annotations && Object.keys(clone.metadata.annotations).length === 0) {
            delete clone.metadata.annotations;
        }
    }
    return clone;
}
