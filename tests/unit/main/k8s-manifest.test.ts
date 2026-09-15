import { beforeEach, describe, expect, it, vi } from 'vitest';

const core = {
    listNamespacedPod: vi.fn(),
    listPodForAllNamespaces: vi.fn(),
    listPersistentVolume: vi.fn(),
    listNode: vi.fn(),
};
/** Every other list the kind map can reach; the table-driven test calls them all. */
const empty = vi.fn(async () => ({ items: [] }));
const rest = new Proxy({} as Record<string, unknown>, { get: () => empty });
const client = {
    apis: () => ({
        core: new Proxy(core as Record<string, unknown>, {
            get: (target, key: string) => target[key] ?? empty,
        }),
        apps: rest,
        batch: rest,
        hpa: rest,
        net: rest,
        rbac: rest,
        storage: rest,
        apiextensions: rest,
    }),
    getActiveNamespace: vi.fn<() => string | null>(),
    resolveObjectNamespace: (explicit?: string) => explicit ?? client.getActiveNamespace(),
    listItems: async <T>(
        ns: string | undefined,
        namespaced: (ns: string) => Promise<{ items: T[] }>,
        all: () => Promise<{ items: T[] }>,
    ) => {
        const resolved = ns ?? client.getActiveNamespace() ?? undefined;
        return resolved ? namespaced(resolved) : all();
    },
};
vi.mock('../../../src/main/k8s/client.js', () => client);
const storage = { listSnapshotObjects: vi.fn(async () => []) };
vi.mock('../../../src/main/k8s/resources/storage.js', () => storage);

const { yamlToText } = await import('../../../src/main/k8s/yaml.js');
const { getObjectYaml } = await import('../../../src/main/k8s/resources/manifest.js');

const pod = {
    metadata: {
        name: 'web-1',
        namespace: 'team-a',
        resourceVersion: '4312',
        uid: '8ab1',
        managedFields: [{ manager: 'kubelet' }],
        annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{"kind":"Pod"}', owner: 'ara' },
    },
    spec: { nodeName: 'node-1' },
    status: { phase: 'Running' },
};

beforeEach(() => {
    vi.clearAllMocks();
    client.getActiveNamespace.mockReturnValue('team-a');
});

describe('yamlToText', () => {
    it('puts the type meta first, whatever order the object carries it in', () => {
        const text = yamlToText({ spec: {}, kind: 'Pod', apiVersion: 'v1' });
        expect(text.split('\n').slice(0, 2)).toEqual(['apiVersion: v1', 'kind: Pod']);
    });

    it('strips server-managed noise but keeps the resource version and status', () => {
        const text = yamlToText(pod);
        expect(text).not.toContain('managedFields');
        expect(text).not.toContain('last-applied-configuration');
        expect(text).toContain('resourceVersion:');
        expect(text).toContain('phase: Running');
        expect(text).toContain('uid: 8ab1');
        expect(text).toContain('owner: ara');
    });

    it('drops the annotation map when stripping empties it', () => {
        const text = yamlToText({
            metadata: { name: 'x', annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{}' } },
        });
        expect(text).not.toContain('annotations');
    });

    it('leaves the object the caller passed untouched', () => {
        const original = structuredClone(pod);
        yamlToText(pod);
        expect(pod).toEqual(original);
    });

    it('emits long values on one line rather than folding them', () => {
        const long = 'x'.repeat(400);
        expect(yamlToText({ data: { blob: long } })).toContain(long);
    });
});

describe('getObjectYaml', () => {
    it('reads a namespaced object from the active namespace and restores its type meta', async () => {
        core.listNamespacedPod.mockResolvedValue({ items: [pod] });
        const manifest = await getObjectYaml('Pod', 'web-1');
        expect(core.listNamespacedPod).toHaveBeenCalledWith({ namespace: 'team-a' });
        expect(manifest).toMatchObject({ kind: 'Pod', namespace: 'team-a' });
        expect(manifest.yaml.startsWith('apiVersion: v1\nkind: Pod\n')).toBe(true);
    });

    it('keeps the type meta the object already carries', async () => {
        core.listNamespacedPod.mockResolvedValue({ items: [{ ...pod, apiVersion: 'v1beta1', kind: 'Pod' }] });
        expect((await getObjectYaml('Pod', 'web-1')).yaml).toContain('apiVersion: v1beta1');
    });

    it('refuses to read a namespaced object when no namespace is known, rather than searching', async () => {
        client.getActiveNamespace.mockReturnValue(null);
        core.listPodForAllNamespaces.mockResolvedValue({ items: [pod] });
        // What this read returns is what the editor writes back, so a guess here would seed a wrong replace.
        await expect(getObjectYaml('Pod', 'web-1')).rejects.toMatchObject({
            kind: 'invalid',
            op: 'resources.getYaml',
            detail: 'A namespace is required to read Pod "web-1".',
        });
        expect(core.listPodForAllNamespaces).not.toHaveBeenCalled();
        expect(core.listNamespacedPod).not.toHaveBeenCalled();
    });

    it('reads in the explicit namespace even when another one is active', async () => {
        core.listNamespacedPod.mockResolvedValue({
            items: [{ ...pod, metadata: { ...pod.metadata, namespace: 'b' } }],
        });
        expect(await getObjectYaml('Pod', 'web-1', 'b')).toMatchObject({ namespace: 'b' });
        expect(core.listNamespacedPod).toHaveBeenCalledWith({ namespace: 'b' });
    });

    it('reads a cluster-scoped object without a namespace', async () => {
        core.listPersistentVolume.mockResolvedValue({ items: [{ metadata: { name: 'pv-1' } }] });
        const manifest = await getObjectYaml('PersistentVolume', 'pv-1');
        expect(manifest.namespace).toBeUndefined();
        expect(manifest.yaml).toContain('kind: PersistentVolume');
    });

    it('reads a node, which is not a registered kind', async () => {
        core.listNode.mockResolvedValue({ items: [{ metadata: { name: 'node-1' } }] });
        expect((await getObjectYaml('Node', 'node-1')).yaml).toContain('kind: Node');
    });

    it('reads a snapshot through its own reader, which tolerates a missing definition', async () => {
        storage.listSnapshotObjects.mockResolvedValue([{ metadata: { name: 'snap', namespace: 'team-a' } }]);
        expect((await getObjectYaml('VolumeSnapshot', 'snap', 'team-a')).kind).toBe('VolumeSnapshot');
        expect(storage.listSnapshotObjects).toHaveBeenCalledWith('team-a');
    });

    it('can read the manifest of every kind, namespaced or cluster-wide', async () => {
        const { manifestKindSchema } = await import('../../../src/shared/k8s/manifest.js');
        const { KIND_REGISTRY } = await import('../../../src/shared/k8s/registry.js');
        for (const kind of manifestKindSchema.options) {
            const clusterScoped = kind === 'Node' || KIND_REGISTRY[kind].clusterScoped;
            // Nothing is listed, so every kind must report the object as missing rather than throw
            // for want of a list function. A namespaced kind with no namespace to read in is refused
            // before any list is made.
            client.getActiveNamespace.mockReturnValue('team-a');
            await expect(getObjectYaml(kind, 'absent', clusterScoped ? undefined : 'team-a')).rejects.toMatchObject({
                kind: 'notFound',
            });
            if (clusterScoped) continue;
            client.getActiveNamespace.mockReturnValue(null);
            await expect(getObjectYaml(kind, 'absent')).rejects.toMatchObject({ kind: 'invalid' });
        }
    });

    it('reports a missing object as not found rather than empty text', async () => {
        core.listNamespacedPod.mockResolvedValue({ items: [] });
        await expect(getObjectYaml('Pod', 'ghost')).rejects.toMatchObject({
            kind: 'notFound',
            op: 'resources.getYaml',
            detail: 'Pod "ghost" was not found.',
        });
    });
});
