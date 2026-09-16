import { gunzipSync } from 'node:zlib';
import type { V1Secret } from '@kubernetes/client-node';
import { dump as dumpYaml } from 'js-yaml';
import type { HelmChart, Release, ReleaseRevision, ReleaseStatus } from '../../../shared/k8s/addons.js';
import { apis, listItems } from '../client.js';
import { withK8s } from '../errors.js';
import { ago } from '../format.js';

/*
 * Helm keeps no API of its own: a release is a Secret of this type whose `release` field is
 * base64(gzip(json)), and one Secret exists per revision. Everything here is read-only decoding.
 */
const HELM_SECRET_TYPE = 'helm.sh/release.v1';
/** Ceiling for one decoded release. Secrets cap at about 1 MiB and gzip can inflate a thousandfold. */
const MAX_RELEASE_BYTES = 32 * 1024 * 1024;

interface HelmReleaseData {
    name?: string;
    namespace?: string;
    version?: number;
    info?: { status?: string; last_deployed?: string; description?: string };
    chart?: { metadata?: { name?: string; version?: string; appVersion?: string } };
    config?: Record<string, unknown>;
}

const HELM_STATUS: Record<string, ReleaseStatus> = {
    deployed: 'Deployed',
    superseded: 'Superseded',
    failed: 'Failed',
    'pending-install': 'Progressing',
    'pending-upgrade': 'Progressing',
    'pending-rollback': 'Progressing',
    uninstalling: 'Terminating',
    uninstalled: 'Unknown',
};

export function helmStatus(status?: string): ReleaseStatus {
    return HELM_STATUS[status ?? ''] ?? 'Unknown';
}

/** The API base64-encodes Secret data, so the stored value is base64 twice over then gzipped. */
export function decodeRelease(secret: V1Secret): HelmReleaseData | null {
    const stored = secret.data?.release;
    if (!stored) return null;
    try {
        const gzipped = Buffer.from(Buffer.from(stored, 'base64').toString('utf8'), 'base64');
        return JSON.parse(
            gunzipSync(gzipped, { maxOutputLength: MAX_RELEASE_BYTES }).toString('utf8'),
        ) as HelmReleaseData;
    } catch {
        // Undecodable, or larger than any real release: a corrupt or hostile Secret is skipped, not inflated.
        return null;
    }
}

/**
 * Release Secrets: the explicit namespace when a caller has one, else the active selection, else
 * every namespace. The per-release reads always pass one, so a release is looked up where its
 * screen says it is rather than where the top bar happens to point.
 */
async function decodedReleases(namespace?: string): Promise<HelmReleaseData[]> {
    const fieldSelector = `type=${HELM_SECRET_TYPE}`;
    const { items } = await listItems(
        namespace,
        (ns) => apis().core.listNamespacedSecret({ namespace: ns, fieldSelector }),
        () => apis().core.listSecretForAllNamespaces({ fieldSelector }),
    );
    return items.map(decodeRelease).filter((release): release is HelmReleaseData => release !== null);
}

function chartLabel(release: HelmReleaseData): string {
    const meta = release.chart?.metadata;
    return meta?.name ? `${meta.name}-${meta.version ?? ''}` : '—';
}

/** What `helm get values` shows; undefined when the release runs on chart defaults alone. */
export function releaseValues(release: HelmReleaseData): string | undefined {
    const config = release.config;
    if (!config || Object.keys(config).length === 0) return undefined;
    try {
        return dumpYaml(config, { indent: 2, lineWidth: -1, noRefs: true, sortKeys: false });
    } catch {
        return undefined;
    }
}

export function toRelease(release: HelmReleaseData, values?: string, now = Date.now()): Release {
    return {
        name: release.name ?? '',
        namespace: release.namespace ?? '',
        chart: chartLabel(release),
        revision: release.version ?? 0,
        status: helmStatus(release.info?.status),
        updated: ago(release.info?.last_deployed, now),
        values,
    };
}

/** One Secret per revision, so the current state is the highest revision of each release. */
export function latestPerRelease(releases: HelmReleaseData[]): HelmReleaseData[] {
    const byName = new Map<string, HelmReleaseData>();
    for (const release of releases) {
        const key = `${release.namespace}/${release.name}`;
        const existing = byName.get(key);
        if (!existing || (release.version ?? 0) > (existing.version ?? 0)) byName.set(key, release);
    }
    return [...byName.values()];
}

export function toRevisions(releases: HelmReleaseData[], now = Date.now()): ReleaseRevision[] {
    return [...releases]
        .sort((a, b) => (b.version ?? 0) - (a.version ?? 0))
        .map((release) => ({
            rev: String(release.version ?? 0),
            status: helmStatus(release.info?.status),
            chartVersion: release.chart?.metadata?.version ?? '—',
            updated: ago(release.info?.last_deployed, now),
            description: release.info?.description ?? '',
        }));
}

/** No repository index exists in a cluster, so the chart list is what the releases installed. */
export function toCharts(releases: HelmReleaseData[]): HelmChart[] {
    const byChart = new Map<string, HelmChart>();
    for (const release of latestPerRelease(releases)) {
        const meta = release.chart?.metadata;
        if (!meta?.name || byChart.has(meta.name)) continue;
        byChart.set(meta.name, {
            name: meta.name,
            repository: '—',
            latestVersion: meta.version ?? '—',
            appVersion: meta.appVersion ?? '—',
            description: release.info?.description ?? '',
        });
    }
    return [...byChart.values()];
}

function matching(releases: HelmReleaseData[], name: string, namespace: string): HelmReleaseData[] {
    return releases.filter((release) => release.name === name && release.namespace === namespace);
}

export function listReleases(): Promise<Release[]> {
    return withK8s('releases.list', async () => latestPerRelease(await decodedReleases()).map((r) => toRelease(r)));
}

export function getRelease(name: string, namespace: string): Promise<Release | null> {
    return withK8s('releases.get', async () => {
        const matches = matching(await decodedReleases(namespace), name, namespace);
        if (matches.length === 0) return null;
        const latest = matches.reduce((a, b) => ((b.version ?? 0) > (a.version ?? 0) ? b : a));
        return toRelease(latest, releaseValues(latest));
    });
}

export function getReleaseRevisions(name: string, namespace: string): Promise<ReleaseRevision[]> {
    return withK8s('releases.revisions', async () =>
        toRevisions(matching(await decodedReleases(namespace), name, namespace)),
    );
}

export function listHelmCharts(): Promise<HelmChart[]> {
    return withK8s('helmCharts.list', async () => toCharts(await decodedReleases()));
}
