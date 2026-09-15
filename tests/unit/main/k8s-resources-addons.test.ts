import { gzipSync } from 'node:zlib';
import { ApiException, type V1CustomResourceDefinition, type V1Secret } from '@kubernetes/client-node';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiextensions = { listCustomResourceDefinition: vi.fn(), readCustomResourceDefinition: vi.fn() };
const core = { listNamespacedSecret: vi.fn(), listSecretForAllNamespaces: vi.fn() };
const client = {
    apis: () => ({ apiextensions, core }),
    getActiveNamespace: vi.fn<() => string | null>(),
    readOrNull: async <T>(read: () => Promise<T>) => {
        try {
            return await read();
        } catch (error) {
            if (error instanceof ApiException && error.code === 404) return undefined;
            throw error;
        }
    },
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

const crds = await import('../../../src/main/k8s/resources/crds.js');
const helm = await import('../../../src/main/k8s/resources/helm.js');

const NOW = Date.parse('2026-09-15T12:00:00Z');
const HOUR = 3600 * 1000;

const crd: V1CustomResourceDefinition = {
    metadata: { name: 'helmcharts.helm.cattle.io', creationTimestamp: new Date(NOW - 3 * HOUR) },
    spec: {
        group: 'helm.cattle.io',
        scope: 'Namespaced',
        names: { kind: 'HelmChart', plural: 'helmcharts' },
        versions: [
            { name: 'v1alpha1', served: true, storage: false },
            { name: 'v1', served: true, storage: true },
        ],
    },
};

/** A release Secret the way Helm writes one: base64(gzip(json)), which the API base64s again. */
function releaseSecret(release: Record<string, unknown>): V1Secret {
    const gzipped = gzipSync(Buffer.from(JSON.stringify(release), 'utf8')).toString('base64');
    return {
        metadata: { name: `sh.helm.release.v1.${String(release.name)}.v${String(release.version)}` },
        type: 'helm.sh/release.v1',
        data: { release: Buffer.from(gzipped, 'utf8').toString('base64') },
    };
}

const deployed = {
    name: 'traefik',
    namespace: 'kube-system',
    version: 2,
    info: {
        status: 'deployed',
        last_deployed: new Date(NOW - HOUR).toISOString(),
        description: 'Upgrade complete',
    },
    chart: { metadata: { name: 'traefik', version: '28.0.0', appVersion: '3.0.0' } },
    config: { service: { type: 'LoadBalancer' } },
};
const superseded = {
    ...deployed,
    version: 1,
    info: { status: 'superseded', last_deployed: new Date(NOW - 2 * HOUR).toISOString(), description: 'Install' },
    config: {},
};

beforeEach(() => {
    vi.clearAllMocks();
    client.getActiveNamespace.mockReturnValue(null);
});

describe('custom resource definitions', () => {
    it('reports the stored version, the group, scope and kind', () => {
        expect(crds.toCustomResource(crd, NOW)).toEqual({
            name: 'helmcharts.helm.cattle.io',
            group: 'helm.cattle.io',
            version: 'v1',
            scope: 'Namespaced',
            kind: 'HelmChart',
            age: '3h',
        });
    });

    it('falls back to the first version when none is marked for storage', () => {
        const noStorage = {
            ...crd,
            spec: { ...crd.spec!, versions: [{ name: 'v1beta1', served: true, storage: false }] },
        };
        expect(crds.toCustomResource(noStorage, NOW).version).toBe('v1beta1');
    });

    it('shows a dash for every field a stripped definition omits', () => {
        expect(crds.toCustomResource({}, NOW)).toMatchObject({
            name: '',
            group: '—',
            version: '—',
            scope: '—',
            kind: '—',
        });
    });

    it('lists and reads definitions and reports a missing one as null', async () => {
        apiextensions.listCustomResourceDefinition.mockResolvedValue({ items: [crd] });
        apiextensions.readCustomResourceDefinition.mockResolvedValue({
            ...crd,
            metadata: { ...crd.metadata, labels: { origin: 'k3s' } },
        });
        expect(await crds.listCustomResources()).toHaveLength(1);
        expect((await crds.getCustomResource('helmcharts.helm.cattle.io'))?.labels).toEqual([['origin', 'k3s']]);

        apiextensions.readCustomResourceDefinition.mockRejectedValue(new ApiException(404, 'gone', {}, {}));
        expect(await crds.getCustomResource('ghost')).toBeNull();
    });
});

describe('helm releases', () => {
    it('decodes a release Secret through both base64 layers and the gzip', () => {
        expect(helm.decodeRelease(releaseSecret(deployed))).toMatchObject({ name: 'traefik', version: 2 });
    });

    it('treats a Secret without release data or with unreadable data as no release', () => {
        expect(helm.decodeRelease({ data: {} })).toBeNull();
        expect(helm.decodeRelease({ data: { release: 'bm90LWd6aXA=' } })).toBeNull();
    });

    it('maps every helm state onto the badge vocabulary', () => {
        expect(helm.helmStatus('deployed')).toBe('Deployed');
        expect(helm.helmStatus('superseded')).toBe('Superseded');
        expect(helm.helmStatus('failed')).toBe('Failed');
        expect(helm.helmStatus('pending-upgrade')).toBe('Progressing');
        expect(helm.helmStatus('uninstalling')).toBe('Terminating');
        expect(helm.helmStatus('uninstalled')).toBe('Unknown');
        expect(helm.helmStatus(undefined)).toBe('Unknown');
        expect(helm.helmStatus('something-new')).toBe('Unknown');
    });

    it('dumps user-supplied values to YAML and omits them when the release uses defaults', () => {
        expect(helm.releaseValues(deployed)).toBe('service:\n  type: LoadBalancer\n');
        expect(helm.releaseValues(superseded)).toBeUndefined();
        expect(helm.releaseValues({})).toBeUndefined();
        // A cyclic config cannot be dumped; the tab then reads as having no values.
        const cyclic: Record<string, unknown> = {};
        cyclic.self = cyclic;
        expect(helm.releaseValues({ config: cyclic })).toBeUndefined();
    });

    it('keeps only the highest revision of each release', () => {
        expect(helm.latestPerRelease([superseded, deployed]).map((r) => r.version)).toEqual([2]);
        expect(
            helm
                .latestPerRelease([deployed, { ...deployed, namespace: 'other', version: 5 }])
                .map((r) => `${r.namespace}/${r.version}`),
        ).toEqual(['kube-system/2', 'other/5']);
    });

    it('lists the current release of each name with its chart and revision', async () => {
        core.listSecretForAllNamespaces.mockResolvedValue({
            items: [releaseSecret(superseded), releaseSecret(deployed), { type: 'Opaque', data: {} }],
        });
        const releases = await helm.listReleases();
        expect(releases).toEqual([
            {
                name: 'traefik',
                namespace: 'kube-system',
                chart: 'traefik-28.0.0',
                revision: 2,
                status: 'Deployed',
                updated: expect.any(String),
                values: undefined,
            },
        ]);
        expect(core.listSecretForAllNamespaces).toHaveBeenCalledWith({ fieldSelector: 'type=helm.sh/release.v1' });
    });

    it('reads the current release of one name in its namespace with its values, and null when absent', async () => {
        core.listNamespacedSecret.mockResolvedValue({
            items: [releaseSecret(superseded), releaseSecret(deployed)],
        });
        expect(await helm.getRelease('traefik', 'kube-system')).toMatchObject({
            revision: 2,
            values: 'service:\n  type: LoadBalancer\n',
        });
        expect(core.listNamespacedSecret).toHaveBeenCalledWith({
            namespace: 'kube-system',
            fieldSelector: 'type=helm.sh/release.v1',
        });
        // Secrets listed in a namespace that holds no such release, and a name nothing carries.
        expect(await helm.getRelease('traefik', 'other')).toBeNull();
        expect(await helm.getRelease('nothing', 'kube-system')).toBeNull();
        expect(core.listSecretForAllNamespaces).not.toHaveBeenCalled();
    });

    it('reads a release in the namespace its screen names even when another namespace is active', async () => {
        client.getActiveNamespace.mockReturnValue('default');
        core.listNamespacedSecret.mockResolvedValue({ items: [releaseSecret(deployed)] });
        expect(await helm.getRelease('traefik', 'kube-system')).toMatchObject({ revision: 2 });
        expect(core.listNamespacedSecret).toHaveBeenCalledWith(expect.objectContaining({ namespace: 'kube-system' }));
    });

    it('lists the revisions of a release newest first', async () => {
        core.listNamespacedSecret.mockResolvedValue({
            items: [releaseSecret(superseded), releaseSecret(deployed)],
        });
        expect(await helm.getReleaseRevisions('traefik', 'kube-system')).toMatchObject([
            { rev: '2', status: 'Deployed', chartVersion: '28.0.0', description: 'Upgrade complete' },
            { rev: '1', status: 'Superseded', chartVersion: '28.0.0', description: 'Install' },
        ]);
    });

    it('skips a release whose payload inflates past the ceiling instead of decoding it', () => {
        // A tiny gzip stream that expands to far more than any real release.
        const bomb = gzipSync(Buffer.alloc(48 * 1024 * 1024, 0x20));
        const secret = { data: { release: Buffer.from(bomb.toString('base64')).toString('base64') } } as V1Secret;
        expect(helm.decodeRelease(secret)).toBeNull();
    });

    it('derives the chart list from the installed releases, one row per chart', async () => {
        core.listSecretForAllNamespaces.mockResolvedValue({
            items: [
                releaseSecret(superseded),
                releaseSecret(deployed),
                releaseSecret({ ...deployed, name: 'traefik-crd', namespace: 'kube-system' }),
                releaseSecret({ name: 'nameless', namespace: 'default', version: 1 }),
            ],
        });
        expect(await helm.listHelmCharts()).toEqual([
            {
                name: 'traefik',
                repository: '—',
                latestVersion: '28.0.0',
                appVersion: '3.0.0',
                description: 'Upgrade complete',
            },
        ]);
    });

    it('reads secrets from the active namespace alone when one is selected', async () => {
        client.getActiveNamespace.mockReturnValue('kube-system');
        core.listNamespacedSecret.mockResolvedValue({ items: [releaseSecret(deployed)] });
        expect(await helm.listReleases()).toHaveLength(1);
        expect(core.listNamespacedSecret).toHaveBeenCalledWith({
            namespace: 'kube-system',
            fieldSelector: 'type=helm.sh/release.v1',
        });
    });

    it('names a chart as a dash when the release carries no chart metadata', async () => {
        core.listSecretForAllNamespaces.mockResolvedValue({ items: [releaseSecret({ name: 'bare', version: 1 })] });
        expect((await helm.listReleases())[0]).toMatchObject({ chart: '—', namespace: '', status: 'Unknown' });
    });

    it('classifies a failed read as a Kubernetes error carrying the operation', async () => {
        core.listSecretForAllNamespaces.mockRejectedValue(new ApiException(403, 'forbidden', {}, {}));
        core.listNamespacedSecret.mockRejectedValue(new ApiException(403, 'forbidden', {}, {}));
        await expect(helm.listReleases()).rejects.toMatchObject({ kind: 'forbidden', op: 'releases.list' });
        await expect(helm.listHelmCharts()).rejects.toMatchObject({ op: 'helmCharts.list' });
        await expect(helm.getRelease('traefik', 'kube-system')).rejects.toMatchObject({ op: 'releases.get' });
        await expect(helm.getReleaseRevisions('traefik', 'kube-system')).rejects.toMatchObject({
            op: 'releases.revisions',
        });
    });
});
