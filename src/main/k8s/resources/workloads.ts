import type { V1DaemonSet, V1Deployment, V1ReplicaSet, V1StatefulSet } from '@kubernetes/client-node';
import type {
    DaemonSet,
    DaemonSetDetail,
    Deployment,
    DeploymentDetail,
    DeploymentStatus,
    ReplicaSet,
    Rollout,
    StatefulSet,
    StatefulSetDetail,
} from '../../../shared/k8s/workloads.js';
import { apis, getNamespaced, listItems } from '../client.js';
import { withK8s } from '../errors.js';
import { age, ago, dash, duration, joinSelector, readyRatio, toPairs } from '../format.js';

/*
 * Pure transforms first, exported for tests and for the watch stream; thin readers at the end.
 */

const firstImage = (containers?: { image?: string }[]): string => dash(containers?.[0]?.image);

/** Scaled to zero is a settled, intentional state, so it reads Available rather than Progressing. */
export function deploymentStatus(desired: number, available: number): DeploymentStatus {
    if (desired === 0) return 'Available';
    return available >= desired ? 'Healthy' : 'Progressing';
}

export function toDeployment(d: V1Deployment, now = Date.now()): Deployment {
    const desired = d.spec?.replicas ?? d.status?.replicas ?? 0;
    const available = d.status?.availableReplicas ?? 0;
    return {
        name: d.metadata?.name ?? '',
        namespace: d.metadata?.namespace ?? '',
        status: deploymentStatus(desired, available),
        ready: readyRatio(d.status?.readyReplicas, desired),
        replicas: desired,
        updated: d.status?.updatedReplicas ?? 0,
        available,
        strategy: d.spec?.strategy?.type ?? 'RollingUpdate',
        image: firstImage(d.spec?.template?.spec?.containers),
        age: age(d.metadata?.creationTimestamp, now),
    };
}

export function toDeploymentDetail(d: V1Deployment, now = Date.now()): DeploymentDetail {
    return {
        ...toDeployment(d, now),
        labels: toPairs(d.metadata?.labels),
        annotations: toPairs(d.metadata?.annotations),
    };
}

export function toStatefulSet(s: V1StatefulSet, now = Date.now()): StatefulSet {
    const desired = s.spec?.replicas ?? s.status?.replicas ?? 0;
    return {
        name: s.metadata?.name ?? '',
        namespace: s.metadata?.namespace ?? '',
        ready: readyRatio(s.status?.readyReplicas, desired),
        replicas: desired,
        service: dash(s.spec?.serviceName),
        image: firstImage(s.spec?.template?.spec?.containers),
        age: age(s.metadata?.creationTimestamp, now),
    };
}

export function toStatefulSetDetail(s: V1StatefulSet, now = Date.now()): StatefulSetDetail {
    return {
        ...toStatefulSet(s, now),
        labels: toPairs(s.metadata?.labels),
        annotations: toPairs(s.metadata?.annotations),
    };
}

export function toDaemonSet(d: V1DaemonSet, now = Date.now()): DaemonSet {
    return {
        name: d.metadata?.name ?? '',
        namespace: d.metadata?.namespace ?? '',
        desired: d.status?.desiredNumberScheduled ?? 0,
        current: d.status?.currentNumberScheduled ?? 0,
        ready: d.status?.numberReady ?? 0,
        upToDate: d.status?.updatedNumberScheduled ?? 0,
        nodeSelector: joinSelector(d.spec?.template?.spec?.nodeSelector),
        age: age(d.metadata?.creationTimestamp, now),
    };
}

export function toDaemonSetDetail(d: V1DaemonSet, now = Date.now()): DaemonSetDetail {
    return {
        ...toDaemonSet(d, now),
        labels: toPairs(d.metadata?.labels),
        annotations: toPairs(d.metadata?.annotations),
    };
}

export function toReplicaSet(rs: V1ReplicaSet, now = Date.now()): ReplicaSet {
    return {
        name: rs.metadata?.name ?? '',
        desired: rs.spec?.replicas ?? 0,
        current: rs.status?.replicas ?? 0,
        ready: rs.status?.readyReplicas ?? 0,
        age: age(rs.metadata?.creationTimestamp, now),
    };
}

const REVISION_ANNOTATION = 'deployment.kubernetes.io/revision';
const CHANGE_CAUSE_ANNOTATION = 'kubernetes.io/change-cause';

/** The ReplicaSets a Deployment owns, by owner reference uid. */
export function ownedReplicaSets(deployment: V1Deployment, sets: V1ReplicaSet[]): V1ReplicaSet[] {
    const uid = deployment.metadata?.uid;
    return sets.filter((rs) => rs.metadata?.ownerReferences?.some((ref) => ref.uid === uid));
}

/** Rollout history from owned ReplicaSets, newest revision first; the deployment's revision is Current. */
export function toRollouts(deployment: V1Deployment, sets: V1ReplicaSet[], now = Date.now()): Rollout[] {
    const currentRevision = deployment.metadata?.annotations?.[REVISION_ANNOTATION];
    return ownedReplicaSets(deployment, sets)
        .map((rs) => ({ rs, revision: rs.metadata?.annotations?.[REVISION_ANNOTATION] ?? '0' }))
        .sort((a, b) => Number(b.revision) - Number(a.revision))
        .map(({ rs, revision }) => ({
            rev: revision,
            state: revision === currentRevision ? 'Current' : 'Superseded',
            image: firstImage(rs.spec?.template?.spec?.containers),
            by: dash(rs.metadata?.annotations?.[CHANGE_CAUSE_ANNOTATION]),
            when: ago(rs.metadata?.creationTimestamp, now),
            duration: duration(rs.metadata?.creationTimestamp, undefined),
        }));
}

export function listDeployments(namespace?: string): Promise<Deployment[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().apps.listNamespacedDeployment({ namespace: ns }),
            () => apis().apps.listDeploymentForAllNamespaces(),
        );
        return items.map((d) => toDeployment(d));
    });
}

function readDeployment(name: string, namespace?: string): Promise<V1Deployment | undefined> {
    return getNamespaced(
        name,
        namespace,
        (n, ns) => apis().apps.readNamespacedDeployment({ name: n, namespace: ns }),
        (fieldSelector) => apis().apps.listDeploymentForAllNamespaces({ fieldSelector }),
    );
}

export function getDeployment(name: string, namespace?: string): Promise<DeploymentDetail | null> {
    return withK8s('resources.get', async () => {
        const d = await readDeployment(name, namespace);
        return d ? toDeploymentDetail(d) : null;
    });
}

async function replicaSetsOf(deployment: V1Deployment): Promise<V1ReplicaSet[]> {
    const ns = deployment.metadata?.namespace;
    if (!ns) return [];
    const res = await apis().apps.listNamespacedReplicaSet({ namespace: ns });
    return ownedReplicaSets(deployment, res.items);
}

export function getDeploymentReplicaSets(name: string, namespace: string): Promise<ReplicaSet[]> {
    return withK8s('deployments.replicaSets', async () => {
        const d = await readDeployment(name, namespace);
        if (!d) return [];
        return (await replicaSetsOf(d)).map((rs) => toReplicaSet(rs));
    });
}

export function getDeploymentRollouts(name: string, namespace: string): Promise<Rollout[]> {
    return withK8s('deployments.rollouts', async () => {
        const d = await readDeployment(name, namespace);
        if (!d) return [];
        return toRollouts(d, await replicaSetsOf(d));
    });
}

export function listStatefulSets(namespace?: string): Promise<StatefulSet[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().apps.listNamespacedStatefulSet({ namespace: ns }),
            () => apis().apps.listStatefulSetForAllNamespaces(),
        );
        return items.map((s) => toStatefulSet(s));
    });
}

export function getStatefulSet(name: string, namespace?: string): Promise<StatefulSetDetail | null> {
    return withK8s('resources.get', async () => {
        const s = await getNamespaced(
            name,
            namespace,
            (n, ns) => apis().apps.readNamespacedStatefulSet({ name: n, namespace: ns }),
            (fieldSelector) => apis().apps.listStatefulSetForAllNamespaces({ fieldSelector }),
        );
        return s ? toStatefulSetDetail(s) : null;
    });
}

export function listDaemonSets(namespace?: string): Promise<DaemonSet[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().apps.listNamespacedDaemonSet({ namespace: ns }),
            () => apis().apps.listDaemonSetForAllNamespaces(),
        );
        return items.map((d) => toDaemonSet(d));
    });
}

export function getDaemonSet(name: string, namespace?: string): Promise<DaemonSetDetail | null> {
    return withK8s('resources.get', async () => {
        const d = await getNamespaced(
            name,
            namespace,
            (n, ns) => apis().apps.readNamespacedDaemonSet({ name: n, namespace: ns }),
            (fieldSelector) => apis().apps.listDaemonSetForAllNamespaces({ fieldSelector }),
        );
        return d ? toDaemonSetDetail(d) : null;
    });
}
