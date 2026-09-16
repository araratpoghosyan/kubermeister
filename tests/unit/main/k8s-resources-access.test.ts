import type {
    V1ClusterRole,
    V1ClusterRoleBinding,
    V1Role,
    V1RoleBinding,
    V1ServiceAccount,
} from '@kubernetes/client-node';
import { ApiException } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = {
    listNamespacedServiceAccount: vi.fn(),
    listServiceAccountForAllNamespaces: vi.fn(),
    readNamespacedServiceAccount: vi.fn(),
};
const rbac = {
    listNamespacedRole: vi.fn(),
    listRoleForAllNamespaces: vi.fn(),
    readNamespacedRole: vi.fn(),
    listNamespacedRoleBinding: vi.fn(),
    listRoleBindingForAllNamespaces: vi.fn(),
    readNamespacedRoleBinding: vi.fn(),
    listClusterRole: vi.fn(),
    readClusterRole: vi.fn(),
    listClusterRoleBinding: vi.fn(),
    readClusterRoleBinding: vi.fn(),
};
const client = {
    apis: () => ({ core, rbac }),
    getActiveNamespace: vi.fn<() => string | null>(),
    resolveObjectNamespace: (explicit?: string) => explicit ?? client.getActiveNamespace(),
    isSafeSelectorValue: () => true,
    listItems: async <T>(
        ns: string | undefined,
        namespaced: (ns: string) => Promise<{ items: T[] }>,
        all: () => Promise<{ items: T[] }>,
    ) => {
        const resolved = ns ?? client.getActiveNamespace() ?? undefined;
        return resolved ? namespaced(resolved) : all();
    },
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ApiException && error.code === 404) return undefined;
            throw error;
        }
    },
    getNamespaced: async <T>(
        name: string,
        namespace: string | undefined,
        readOne: (name: string, ns: string) => Promise<T>,
    ) => {
        const ns = client.resolveObjectNamespace(namespace);
        if (!ns) return undefined;
        return client.readOrNull(() => readOne(name, ns));
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);

const access = await import('../../../src/main/k8s/resources/access.js');

const NOW = Date.parse('2026-09-15T12:00:00Z');
const HOUR = 3600 * 1000;
const created = new Date(NOW - 2 * HOUR);

const account: V1ServiceAccount = {
    metadata: { name: 'builder', namespace: 'team-a', creationTimestamp: created, labels: { tier: 'ci' } },
    secrets: [{ name: 'builder-token' }],
};
const role: V1Role = {
    metadata: { name: 'reader', namespace: 'team-a', creationTimestamp: created },
    rules: [
        { apiGroups: [''], resources: ['pods'], verbs: ['get'] },
        { apiGroups: [''], resources: ['services'], verbs: ['list'] },
    ],
};
const binding: V1RoleBinding = {
    metadata: { name: 'reader-binding', namespace: 'team-a', creationTimestamp: created },
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'Role', name: 'reader' },
    subjects: [{ kind: 'ServiceAccount', name: 'builder', namespace: 'team-a' }],
};
const clusterRole: V1ClusterRole = {
    metadata: { name: 'cluster-admin', creationTimestamp: created, annotations: { owner: 'platform' } },
    rules: [{ apiGroups: ['*'], resources: ['*'], verbs: ['*'] }],
};
const aggregated: V1ClusterRole = {
    metadata: { name: 'view', creationTimestamp: created },
    aggregationRule: { clusterRoleSelectors: [{ matchLabels: { agg: 'true' } }] },
};
const clusterBinding: V1ClusterRoleBinding = {
    metadata: { name: 'admins', creationTimestamp: created },
    roleRef: { apiGroup: 'rbac.authorization.k8s.io', kind: 'ClusterRole', name: 'cluster-admin' },
    subjects: [
        { kind: 'User', name: 'ara' },
        { kind: 'Group', name: 'platform' },
    ],
};

beforeEach(() => {
    vi.clearAllMocks();
    client.getActiveNamespace.mockReturnValue('team-a');
});

describe('access transforms', () => {
    it('counts the secrets a service account references', () => {
        expect(access.toServiceAccount(account, NOW)).toEqual({
            name: 'builder',
            namespace: 'team-a',
            secrets: 1,
            age: '2h',
        });
    });

    it('reports no secrets when the cluster mints tokens on demand', () => {
        expect(access.toServiceAccount({ metadata: { name: 'default', namespace: 'team-a' } }, NOW).secrets).toBe(0);
    });

    it('carries labels and annotations on the detail variants', () => {
        expect(access.toServiceAccountDetail(account, NOW).labels).toEqual([['tier', 'ci']]);
        expect(access.toClusterRoleDetail(clusterRole, NOW).annotations).toEqual([['owner', 'platform']]);
        expect(access.toRoleDetail(role, NOW).labels).toEqual([]);
        expect(access.toRoleBindingDetail(binding, NOW).annotations).toEqual([]);
        expect(access.toClusterRoleBindingDetail(clusterBinding, NOW).labels).toEqual([]);
    });

    it('counts the rules of a role and of a cluster role', () => {
        expect(access.toRole(role, NOW)).toEqual({ name: 'reader', namespace: 'team-a', rules: 2, age: '2h' });
        expect(access.toClusterRole(clusterRole, NOW)).toEqual({
            name: 'cluster-admin',
            rules: 1,
            aggregated: false,
            age: '2h',
        });
    });

    it('marks a cluster role whose rules come from an aggregation selector', () => {
        // An aggregated role starts with no rules of its own; the controller fills them in.
        expect(access.toClusterRole(aggregated, NOW)).toMatchObject({ rules: 0, aggregated: true });
    });

    it('names the bound role as kind over name and counts the subjects', () => {
        expect(access.toRoleBinding(binding, NOW)).toEqual({
            name: 'reader-binding',
            namespace: 'team-a',
            role: 'Role/reader',
            subjects: 1,
            age: '2h',
        });
        expect(access.toClusterRoleBinding(clusterBinding, NOW)).toEqual({
            name: 'admins',
            role: 'ClusterRole/cluster-admin',
            subjects: 2,
            age: '2h',
        });
    });

    it('falls back to empty strings and zero counts for a stripped object', () => {
        expect(access.toRoleBinding({ roleRef: { apiGroup: '', kind: 'Role', name: 'r' } }, NOW)).toMatchObject({
            name: '',
            namespace: '',
            subjects: 0,
        });
        expect(access.toRole({}, NOW)).toMatchObject({ name: '', namespace: '', rules: 0 });
        expect(access.toClusterRole({}, NOW)).toMatchObject({ name: '', rules: 0, aggregated: false });
        expect(
            access.toClusterRoleBinding({ roleRef: { apiGroup: '', kind: 'ClusterRole', name: 'c' } }, NOW),
        ).toMatchObject({
            name: '',
            subjects: 0,
        });
        expect(access.toServiceAccount({}, NOW)).toMatchObject({ name: '', namespace: '', secrets: 0 });
    });
});

describe('access readers', () => {
    it('lists the namespaced kinds in the active namespace', async () => {
        core.listNamespacedServiceAccount.mockResolvedValue({ items: [account] });
        rbac.listNamespacedRole.mockResolvedValue({ items: [role] });
        rbac.listNamespacedRoleBinding.mockResolvedValue({ items: [binding] });

        expect(await access.listServiceAccounts()).toHaveLength(1);
        expect(core.listNamespacedServiceAccount).toHaveBeenCalledWith({ namespace: 'team-a' });
        expect((await access.listRoles())[0]).toMatchObject({ name: 'reader' });
        expect((await access.listRoleBindings())[0]).toMatchObject({ role: 'Role/reader' });
    });

    it('lists across all namespaces when no namespace is active', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        core.listServiceAccountForAllNamespaces.mockResolvedValue({ items: [account] });
        rbac.listRoleForAllNamespaces.mockResolvedValue({ items: [role] });
        rbac.listRoleBindingForAllNamespaces.mockResolvedValue({ items: [binding] });

        expect(await access.listServiceAccounts()).toHaveLength(1);
        expect(await access.listRoles()).toHaveLength(1);
        expect(await access.listRoleBindings()).toHaveLength(1);
        expect(core.listNamespacedServiceAccount).not.toHaveBeenCalled();
    });

    it('reads a namespaced object by name and reports a missing one as null', async () => {
        core.readNamespacedServiceAccount.mockResolvedValue(account);
        rbac.readNamespacedRole.mockResolvedValue(role);
        rbac.readNamespacedRoleBinding.mockResolvedValue(binding);

        expect(await access.getServiceAccount('builder')).toMatchObject({ secrets: 1 });
        expect(await access.getRole('reader')).toMatchObject({ rules: 2 });
        expect(await access.getRoleBinding('reader-binding')).toMatchObject({ subjects: 1 });

        rbac.readNamespacedRole.mockRejectedValue(new ApiException(404, 'gone', {}, {}));
        expect(await access.getRole('ghost')).toBeNull();
    });

    it('answers not found for a namespaced object when no namespace is known, without searching', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        rbac.listRoleBindingForAllNamespaces.mockResolvedValue({ items: [binding] });
        rbac.listRoleForAllNamespaces.mockResolvedValue({ items: [role] });

        expect(await access.getRoleBinding('reader-binding')).toBeNull();
        expect(await access.getServiceAccount('nobody')).toBeNull();
        expect(await access.getRole('reader')).toBeNull();
        expect(rbac.listRoleBindingForAllNamespaces).not.toHaveBeenCalled();
        expect(rbac.listRoleForAllNamespaces).not.toHaveBeenCalled();
        expect(rbac.readNamespacedRole).not.toHaveBeenCalled();
    });

    it('reads the cluster-scoped kinds without a namespace', async () => {
        rbac.listClusterRole.mockResolvedValue({ items: [clusterRole, aggregated] });
        rbac.listClusterRoleBinding.mockResolvedValue({ items: [clusterBinding] });
        rbac.readClusterRole.mockResolvedValue(clusterRole);
        rbac.readClusterRoleBinding.mockResolvedValue(clusterBinding);

        expect(await access.listClusterRoles()).toHaveLength(2);
        expect(await access.listClusterRoleBindings()).toHaveLength(1);
        expect(await access.getClusterRole('cluster-admin')).toMatchObject({ rules: 1 });
        expect(await access.getClusterRoleBinding('admins')).toMatchObject({ subjects: 2 });
        expect(rbac.readClusterRole).toHaveBeenCalledWith({ name: 'cluster-admin' });
    });

    it('reports a missing cluster-scoped object as null', async () => {
        rbac.readClusterRole.mockRejectedValue(new ApiException(404, 'gone', {}, {}));
        rbac.readClusterRoleBinding.mockRejectedValue(new ApiException(404, 'gone', {}, {}));
        expect(await access.getClusterRole('ghost')).toBeNull();
        expect(await access.getClusterRoleBinding('ghost')).toBeNull();
    });

    it('classifies a failed list as a Kubernetes error carrying the operation', async () => {
        rbac.listClusterRole.mockRejectedValue(new ApiException(403, 'forbidden', {}, {}));
        await expect(access.listClusterRoles()).rejects.toMatchObject({ kind: 'forbidden', op: 'resources.list' });
    });
});
