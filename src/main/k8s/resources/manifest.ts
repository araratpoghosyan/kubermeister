import type { Manifest, ManifestKind } from '../../../shared/k8s/manifest.js';
import { KIND_REGISTRY } from '../../../shared/k8s/registry.js';
import { apis, listItems } from '../client.js';
import { K8sError, withK8s } from '../errors.js';
import { yamlToText } from '../yaml.js';
import { listSnapshotObjects } from './storage.js';

/**
 * Reading one live object as raw YAML. The list call cannot live in the shared registry (it closes
 * over the client), so it is the one per-kind fact kept here; everything else about a kind comes
 * from {@link KIND_REGISTRY}. Typing the map over every kind makes a new kind a compile error until
 * its manifest is readable too.
 */

interface RawItem {
    metadata?: { name?: string; namespace?: string };
}

/** Lists the raw objects for an unresolved namespace; cluster-scoped kinds ignore it. */
type ListFn = (namespace: string | undefined) => Promise<{ items: RawItem[] }>;

const LIST_FNS: Record<ManifestKind, ListFn> = {
    Pod: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedPod({ namespace: n }),
            () => apis().core.listPodForAllNamespaces(),
        ),
    Deployment: (ns) =>
        listItems(
            ns,
            (n) => apis().apps.listNamespacedDeployment({ namespace: n }),
            () => apis().apps.listDeploymentForAllNamespaces(),
        ),
    StatefulSet: (ns) =>
        listItems(
            ns,
            (n) => apis().apps.listNamespacedStatefulSet({ namespace: n }),
            () => apis().apps.listStatefulSetForAllNamespaces(),
        ),
    DaemonSet: (ns) =>
        listItems(
            ns,
            (n) => apis().apps.listNamespacedDaemonSet({ namespace: n }),
            () => apis().apps.listDaemonSetForAllNamespaces(),
        ),
    Job: (ns) =>
        listItems(
            ns,
            (n) => apis().batch.listNamespacedJob({ namespace: n }),
            () => apis().batch.listJobForAllNamespaces(),
        ),
    CronJob: (ns) =>
        listItems(
            ns,
            (n) => apis().batch.listNamespacedCronJob({ namespace: n }),
            () => apis().batch.listCronJobForAllNamespaces(),
        ),
    HorizontalPodAutoscaler: (ns) =>
        listItems(
            ns,
            (n) => apis().hpa.listNamespacedHorizontalPodAutoscaler({ namespace: n }),
            () => apis().hpa.listHorizontalPodAutoscalerForAllNamespaces(),
        ),
    ConfigMap: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedConfigMap({ namespace: n }),
            () => apis().core.listConfigMapForAllNamespaces(),
        ),
    Secret: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedSecret({ namespace: n }),
            () => apis().core.listSecretForAllNamespaces(),
        ),
    Service: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedService({ namespace: n }),
            () => apis().core.listServiceForAllNamespaces(),
        ),
    Ingress: (ns) =>
        listItems(
            ns,
            (n) => apis().net.listNamespacedIngress({ namespace: n }),
            () => apis().net.listIngressForAllNamespaces(),
        ),
    Endpoints: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedEndpoints({ namespace: n }),
            () => apis().core.listEndpointsForAllNamespaces(),
        ),
    NetworkPolicy: (ns) =>
        listItems(
            ns,
            (n) => apis().net.listNamespacedNetworkPolicy({ namespace: n }),
            () => apis().net.listNetworkPolicyForAllNamespaces(),
        ),
    PersistentVolume: () => apis().core.listPersistentVolume(),
    PersistentVolumeClaim: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedPersistentVolumeClaim({ namespace: n }),
            () => apis().core.listPersistentVolumeClaimForAllNamespaces(),
        ),
    StorageClass: () => apis().storage.listStorageClass(),
    // The snapshot reader returns the objects directly, since its CRD may be absent entirely.
    VolumeSnapshot: async (ns) => ({ items: await listSnapshotObjects(ns) }),
    ServiceAccount: (ns) =>
        listItems(
            ns,
            (n) => apis().core.listNamespacedServiceAccount({ namespace: n }),
            () => apis().core.listServiceAccountForAllNamespaces(),
        ),
    Role: (ns) =>
        listItems(
            ns,
            (n) => apis().rbac.listNamespacedRole({ namespace: n }),
            () => apis().rbac.listRoleForAllNamespaces(),
        ),
    RoleBinding: (ns) =>
        listItems(
            ns,
            (n) => apis().rbac.listNamespacedRoleBinding({ namespace: n }),
            () => apis().rbac.listRoleBindingForAllNamespaces(),
        ),
    ClusterRole: () => apis().rbac.listClusterRole(),
    ClusterRoleBinding: () => apis().rbac.listClusterRoleBinding(),
    CustomResourceDefinition: () => apis().apiextensions.listCustomResourceDefinition(),
    Node: () => apis().core.listNode(),
};

/** A node is not a registered kind, so its type meta is stated here. */
const NODE_FACTS = { apiVersion: 'v1', kind: 'Node' };

function typeMeta(kind: ManifestKind): { apiVersion: string; kind: string } {
    if (kind === 'Node') return NODE_FACTS;
    const info = KIND_REGISTRY[kind];
    return { apiVersion: info.apiVersion, kind: info.kind };
}

export async function findRawObject(
    kind: ManifestKind,
    name: string,
    namespace: string | undefined,
): Promise<RawItem | undefined> {
    const { items } = await LIST_FNS[kind](namespace);
    return items.find((item) => item.metadata?.name === name);
}

/**
 * One object's live manifest. A missing object is a real error rather than empty text, because the
 * panel needs to say so instead of showing a blank editor.
 */
export function getObjectYaml(kind: ManifestKind, name: string, namespace?: string): Promise<Manifest> {
    return withK8s('resources.getYaml', async () => {
        const obj = await findRawObject(kind, name, namespace);
        const meta = typeMeta(kind);
        if (!obj) throw new K8sError('notFound', `${meta.kind} "${name}" was not found.`, 'resources.getYaml');
        const manifest: Record<string, unknown> = { ...obj };
        manifest.apiVersion ??= meta.apiVersion;
        manifest.kind ??= meta.kind;
        return { yaml: yamlToText(manifest), kind: meta.kind, namespace: obj.metadata?.namespace };
    });
}
