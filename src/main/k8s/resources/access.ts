import type {
    V1ClusterRole,
    V1ClusterRoleBinding,
    V1Role,
    V1RoleBinding,
    V1ServiceAccount,
} from '@kubernetes/client-node';
import type {
    ClusterRole,
    ClusterRoleBinding,
    ClusterRoleBindingDetail,
    ClusterRoleDetail,
    Role,
    RoleBinding,
    RoleBindingDetail,
    RoleDetail,
    ServiceAccount,
    ServiceAccountDetail,
} from '../../../shared/k8s/access.js';
import { apis, getNamespaced, listItems, readOrNull } from '../client.js';
import { withK8s } from '../errors.js';
import { age, toPairs } from '../format.js';

/*
 * Identity and RBAC. Roles and their bindings come in a namespaced and a cluster-scoped flavour;
 * the cluster ones ignore the active namespace.
 */

export function toServiceAccount(account: V1ServiceAccount, now = Date.now()): ServiceAccount {
    return {
        name: account.metadata?.name ?? '',
        namespace: account.metadata?.namespace ?? '',
        secrets: account.secrets?.length ?? 0,
        age: age(account.metadata?.creationTimestamp, now),
    };
}

export function toServiceAccountDetail(account: V1ServiceAccount, now = Date.now()): ServiceAccountDetail {
    return {
        ...toServiceAccount(account, now),
        labels: toPairs(account.metadata?.labels),
        annotations: toPairs(account.metadata?.annotations),
    };
}

export function toRole(role: V1Role, now = Date.now()): Role {
    return {
        name: role.metadata?.name ?? '',
        namespace: role.metadata?.namespace ?? '',
        rules: role.rules?.length ?? 0,
        age: age(role.metadata?.creationTimestamp, now),
    };
}

export function toRoleDetail(role: V1Role, now = Date.now()): RoleDetail {
    return {
        ...toRole(role, now),
        labels: toPairs(role.metadata?.labels),
        annotations: toPairs(role.metadata?.annotations),
    };
}

export function toRoleBinding(binding: V1RoleBinding, now = Date.now()): RoleBinding {
    return {
        name: binding.metadata?.name ?? '',
        namespace: binding.metadata?.namespace ?? '',
        role: `${binding.roleRef.kind}/${binding.roleRef.name}`,
        subjects: binding.subjects?.length ?? 0,
        age: age(binding.metadata?.creationTimestamp, now),
    };
}

export function toRoleBindingDetail(binding: V1RoleBinding, now = Date.now()): RoleBindingDetail {
    return {
        ...toRoleBinding(binding, now),
        labels: toPairs(binding.metadata?.labels),
        annotations: toPairs(binding.metadata?.annotations),
    };
}

export function toClusterRole(role: V1ClusterRole, now = Date.now()): ClusterRole {
    return {
        name: role.metadata?.name ?? '',
        rules: role.rules?.length ?? 0,
        aggregated: Boolean(role.aggregationRule),
        age: age(role.metadata?.creationTimestamp, now),
    };
}

export function toClusterRoleDetail(role: V1ClusterRole, now = Date.now()): ClusterRoleDetail {
    return {
        ...toClusterRole(role, now),
        labels: toPairs(role.metadata?.labels),
        annotations: toPairs(role.metadata?.annotations),
    };
}

export function toClusterRoleBinding(binding: V1ClusterRoleBinding, now = Date.now()): ClusterRoleBinding {
    return {
        name: binding.metadata?.name ?? '',
        role: `${binding.roleRef.kind}/${binding.roleRef.name}`,
        subjects: binding.subjects?.length ?? 0,
        age: age(binding.metadata?.creationTimestamp, now),
    };
}

export function toClusterRoleBindingDetail(binding: V1ClusterRoleBinding, now = Date.now()): ClusterRoleBindingDetail {
    return {
        ...toClusterRoleBinding(binding, now),
        labels: toPairs(binding.metadata?.labels),
        annotations: toPairs(binding.metadata?.annotations),
    };
}

export function listServiceAccounts(namespace?: string): Promise<ServiceAccount[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().core.listNamespacedServiceAccount({ namespace: ns }),
            () => apis().core.listServiceAccountForAllNamespaces(),
        );
        return items.map((account) => toServiceAccount(account));
    });
}

export function getServiceAccount(name: string, namespace?: string): Promise<ServiceAccountDetail | null> {
    return withK8s('resources.get', async () => {
        const account = await getNamespaced(
            name,
            namespace,
            (n, ns) => apis().core.readNamespacedServiceAccount({ name: n, namespace: ns }),
            (fieldSelector) => apis().core.listServiceAccountForAllNamespaces({ fieldSelector }),
        );
        return account ? toServiceAccountDetail(account) : null;
    });
}

export function listRoles(namespace?: string): Promise<Role[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().rbac.listNamespacedRole({ namespace: ns }),
            () => apis().rbac.listRoleForAllNamespaces(),
        );
        return items.map((role) => toRole(role));
    });
}

export function getRole(name: string, namespace?: string): Promise<RoleDetail | null> {
    return withK8s('resources.get', async () => {
        const role = await getNamespaced(
            name,
            namespace,
            (n, ns) => apis().rbac.readNamespacedRole({ name: n, namespace: ns }),
            (fieldSelector) => apis().rbac.listRoleForAllNamespaces({ fieldSelector }),
        );
        return role ? toRoleDetail(role) : null;
    });
}

export function listRoleBindings(namespace?: string): Promise<RoleBinding[]> {
    return withK8s('resources.list', async () => {
        const { items } = await listItems(
            namespace,
            (ns) => apis().rbac.listNamespacedRoleBinding({ namespace: ns }),
            () => apis().rbac.listRoleBindingForAllNamespaces(),
        );
        return items.map((binding) => toRoleBinding(binding));
    });
}

export function getRoleBinding(name: string, namespace?: string): Promise<RoleBindingDetail | null> {
    return withK8s('resources.get', async () => {
        const binding = await getNamespaced(
            name,
            namespace,
            (n, ns) => apis().rbac.readNamespacedRoleBinding({ name: n, namespace: ns }),
            (fieldSelector) => apis().rbac.listRoleBindingForAllNamespaces({ fieldSelector }),
        );
        return binding ? toRoleBindingDetail(binding) : null;
    });
}

export function listClusterRoles(): Promise<ClusterRole[]> {
    return withK8s('resources.list', async () => {
        const res = await apis().rbac.listClusterRole();
        return res.items.map((role) => toClusterRole(role));
    });
}

export function getClusterRole(name: string): Promise<ClusterRoleDetail | null> {
    return withK8s('resources.get', async () => {
        const role = await readOrNull(() => apis().rbac.readClusterRole({ name }));
        return role ? toClusterRoleDetail(role) : null;
    });
}

export function listClusterRoleBindings(): Promise<ClusterRoleBinding[]> {
    return withK8s('resources.list', async () => {
        const res = await apis().rbac.listClusterRoleBinding();
        return res.items.map((binding) => toClusterRoleBinding(binding));
    });
}

export function getClusterRoleBinding(name: string): Promise<ClusterRoleBindingDetail | null> {
    return withK8s('resources.get', async () => {
        const binding = await readOrNull(() => apis().rbac.readClusterRoleBinding({ name }));
        return binding ? toClusterRoleBindingDetail(binding) : null;
    });
}
