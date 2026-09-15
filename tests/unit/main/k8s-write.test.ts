import { ApiException } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const objects = { create: vi.fn(), replace: vi.fn(), delete: vi.fn() };
const apps = {
    readNamespacedDeploymentScale: vi.fn(),
    replaceNamespacedDeploymentScale: vi.fn(),
    readNamespacedStatefulSetScale: vi.fn(),
    replaceNamespacedStatefulSetScale: vi.fn(),
};
const client = {
    apis: () => ({ objects, apps }),
    getActiveNamespace: vi.fn<() => string | null>(),
    resolveObjectNamespace: (explicit?: string) => explicit ?? client.getActiveNamespace(),
};
vi.mock('../../../src/main/k8s/client.js', () => client);

const write = await import('../../../src/main/k8s/resources/write.js');

const CONFIG_MAP = ['apiVersion: v1', 'kind: ConfigMap', 'metadata:', '  name: app-config', 'data:', '  a: b'].join(
    '\n',
);

beforeEach(() => {
    vi.clearAllMocks();
    client.getActiveNamespace.mockReturnValue('team-a');
    objects.create.mockImplementation(async (spec: Record<string, unknown>) => spec);
    objects.replace.mockImplementation(async (spec: Record<string, unknown>) => spec);
});

describe('parseManifest', () => {
    it('rejects text that is not YAML', () => {
        expect(() => write.parseManifest('a:\n b: [', 'op')).toThrowError(/not valid YAML/);
    });

    it('rejects a list, a scalar and an empty document', () => {
        for (const text of ['- a\n- b', 'just a string', '']) {
            expect(() => write.parseManifest(text, 'op')).toThrowError(/single YAML object/);
        }
    });

    it('rejects an object without a type or a name', () => {
        expect(() => write.parseManifest('metadata:\n  name: x', 'op')).toThrowError(/apiVersion and kind/);
        expect(() => write.parseManifest('apiVersion: v1\nkind: Pod', 'op')).toThrowError(/metadata.name/);
    });

    it('accepts a generated name, which only a create can use', () => {
        const spec = write.parseManifest('apiVersion: v1\nkind: Pod\nmetadata:\n  generateName: web-', 'op');
        expect(spec.metadata?.generateName).toBe('web-');
    });
});

describe('createResource', () => {
    it('applies the active namespace to a namespaced kind that omits one', async () => {
        expect(await write.createResource(CONFIG_MAP)).toEqual({
            kind: 'ConfigMap',
            name: 'app-config',
            namespace: 'team-a',
        });
        expect(objects.create).toHaveBeenCalledWith(
            expect.objectContaining({ metadata: expect.objectContaining({ namespace: 'team-a' }) }),
            undefined,
            undefined,
        );
    });

    it('keeps a namespace the manifest states', async () => {
        const manifest = CONFIG_MAP.replace('  name: app-config', '  name: app-config\n  namespace: other');
        expect((await write.createResource(manifest)).namespace).toBe('other');
    });

    it('never gives a namespace to a cluster-scoped kind, registered or not', async () => {
        const clusterRole = 'apiVersion: rbac.authorization.k8s.io/v1\nkind: ClusterRole\nmetadata:\n  name: reader';
        expect((await write.createResource(clusterRole)).namespace).toBeUndefined();
        const namespaceObject = 'apiVersion: v1\nkind: Namespace\nmetadata:\n  name: team-b';
        expect((await write.createResource(namespaceObject)).namespace).toBeUndefined();
    });

    it('leaves the namespace unset when no namespace is active', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        expect((await write.createResource(CONFIG_MAP)).namespace).toBeUndefined();
    });

    it('asks the server to run admission without persisting on a dry run', async () => {
        await write.createResource(CONFIG_MAP, true);
        expect(objects.create).toHaveBeenCalledWith(expect.anything(), undefined, 'All');
    });

    it('reports what the server named the object when the manifest only generated one', async () => {
        objects.create.mockResolvedValue({ kind: 'Pod', metadata: { name: 'web-x9', namespace: 'team-a' } });
        const manifest = 'apiVersion: v1\nkind: Pod\nmetadata:\n  generateName: web-';
        expect(await write.createResource(manifest)).toEqual({ kind: 'Pod', name: 'web-x9', namespace: 'team-a' });
    });

    it('classifies a rejected write, including a name that is already taken', async () => {
        objects.create.mockRejectedValue(new ApiException(409, 'exists', {}, {}));
        await expect(write.createResource(CONFIG_MAP)).rejects.toMatchObject({
            kind: 'conflict',
            op: 'resources.create',
        });
    });
});

describe('replaceResource', () => {
    const versioned = CONFIG_MAP.replace('  name: app-config', '  name: app-config\n  resourceVersion: "42"');

    it('replaces an object that carries the version it was read with', async () => {
        expect(await write.replaceResource(versioned)).toMatchObject({ name: 'app-config', namespace: 'team-a' });
        expect(objects.replace).toHaveBeenCalledWith(expect.anything(), undefined, undefined);
    });

    it('refuses a manifest without a resource version, which would overwrite blindly', async () => {
        await expect(write.replaceResource(CONFIG_MAP)).rejects.toMatchObject({
            kind: 'invalid',
            detail: expect.stringContaining('resourceVersion'),
        });
    });

    it('refuses a generated name, which no existing object has', async () => {
        const manifest = 'apiVersion: v1\nkind: Pod\nmetadata:\n  generateName: web-';
        await expect(write.replaceResource(manifest)).rejects.toMatchObject({ kind: 'invalid' });
    });

    it('reports a concurrent change as a conflict rather than overwriting it', async () => {
        objects.replace.mockRejectedValue(new ApiException(409, 'changed', {}, {}));
        await expect(write.replaceResource(versioned)).rejects.toMatchObject({ kind: 'conflict' });
    });

    it('runs admission without persisting on a dry run', async () => {
        await write.replaceResource(versioned, true);
        expect(objects.replace).toHaveBeenCalledWith(expect.anything(), undefined, 'All');
    });
});

describe('deleteResource', () => {
    it('deletes a namespaced object in the active namespace', async () => {
        expect(await write.deleteResource('ConfigMap', 'app-config')).toEqual({
            kind: 'ConfigMap',
            name: 'app-config',
            namespace: 'team-a',
        });
        expect(objects.delete).toHaveBeenCalledWith({
            apiVersion: 'v1',
            kind: 'ConfigMap',
            metadata: { name: 'app-config', namespace: 'team-a' },
        });
    });

    it('refuses a namespaced delete when no namespace resolves, rather than guessing', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        await expect(write.deleteResource('ConfigMap', 'app-config')).rejects.toMatchObject({
            kind: 'invalid',
            op: 'resources.delete',
        });
        expect(objects.delete).not.toHaveBeenCalled();
    });

    it('deletes a cluster-scoped object with no namespace at all', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        expect(await write.deleteResource('ClusterRole', 'reader')).toMatchObject({ namespace: undefined });
        expect(objects.delete).toHaveBeenCalledWith({
            apiVersion: 'rbac.authorization.k8s.io/v1',
            kind: 'ClusterRole',
            metadata: { name: 'reader', namespace: undefined },
        });
    });

    it('deletes a node, which is not a registered kind', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        expect(await write.deleteResource('Node', 'node-1')).toMatchObject({ kind: 'Node' });
    });

    it('reports an object that is already gone as not found', async () => {
        objects.delete.mockRejectedValue(new ApiException(404, 'gone', {}, {}));
        await expect(write.deleteResource('ConfigMap', 'ghost', 'team-a')).rejects.toMatchObject({
            kind: 'notFound',
        });
    });
});

describe('scaleResource', () => {
    it('reads the current scale and writes back the requested count', async () => {
        apps.readNamespacedDeploymentScale.mockResolvedValue({
            metadata: { resourceVersion: '7' },
            spec: { replicas: 1 },
        });
        expect(await write.scaleResource('Deployment', 'web', 3)).toEqual({
            kind: 'Deployment',
            name: 'web',
            namespace: 'team-a',
        });
        expect(apps.replaceNamespacedDeploymentScale).toHaveBeenCalledWith({
            name: 'web',
            namespace: 'team-a',
            body: { metadata: { resourceVersion: '7' }, spec: { replicas: 3 } },
        });
    });

    it('scales a stateful set through its own subresource', async () => {
        apps.readNamespacedStatefulSetScale.mockResolvedValue({ spec: {} });
        await write.scaleResource('StatefulSet', 'db', 2, 'team-b');
        expect(apps.replaceNamespacedStatefulSetScale).toHaveBeenCalledWith({
            name: 'db',
            namespace: 'team-b',
            body: { spec: { replicas: 2 } },
        });
    });

    it('refuses a kind that has no scale subresource', async () => {
        await expect(write.scaleResource('DaemonSet', 'agent', 2)).rejects.toMatchObject({
            kind: 'invalid',
            detail: 'DaemonSet cannot be scaled.',
        });
        await expect(write.scaleResource('Pod', 'web-1', 2)).rejects.toMatchObject({ kind: 'invalid' });
    });

    it('refuses to scale when no namespace resolves', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        await expect(write.scaleResource('Deployment', 'web', 3)).rejects.toMatchObject({ kind: 'invalid' });
        expect(apps.readNamespacedDeploymentScale).not.toHaveBeenCalled();
    });

    it('reports a scale that raced another writer as a conflict', async () => {
        apps.readNamespacedDeploymentScale.mockResolvedValue({ spec: { replicas: 1 } });
        apps.replaceNamespacedDeploymentScale.mockRejectedValue(new ApiException(409, 'changed', {}, {}));
        await expect(write.scaleResource('Deployment', 'web', 3)).rejects.toMatchObject({ kind: 'conflict' });
    });
});
