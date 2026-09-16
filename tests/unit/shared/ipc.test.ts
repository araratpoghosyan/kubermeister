import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { ipcResultSchema, ipcSchemas } from '../../../src/shared/ipc';

describe('IPC contract', () => {
    it('allowlists exactly the channels that have schemas', () => {
        expect([...IPC_CHANNELS].sort()).toEqual(Object.keys(ipcSchemas).sort());
    });

    it('every channel declares an input and an output schema', () => {
        for (const schema of Object.values(ipcSchemas)) {
            expect(typeof schema.input.safeParse).toBe('function');
            expect(typeof schema.output.safeParse).toBe('function');
            expect(schema.input.safeParse('not an object').success).toBe(false);
        }
    });

    it('app.info output requires every runtime field', () => {
        const valid = { name: 'x', version: '1', electron: '44', chrome: '152', node: '24', platform: 'darwin' };
        expect(ipcSchemas['app.info'].output.safeParse(valid).success).toBe(true);
        const { node: _node, ...missingNode } = valid;
        expect(ipcSchemas['app.info'].output.safeParse(missingNode).success).toBe(false);
    });

    it('update.state accepts every status and bounds the progress percentage', () => {
        const output = ipcSchemas['update.state'].output;
        for (const status of ['unsupported', 'idle', 'checking', 'up-to-date', 'downloading', 'downloaded', 'error']) {
            expect(output.safeParse({ status }).success).toBe(true);
        }
        expect(output.safeParse({ status: 'downloading', percent: 42 }).success).toBe(true);
        expect(output.safeParse({ status: 'downloading', percent: 101 }).success).toBe(false);
        expect(output.safeParse({ status: 'rebooting' }).success).toBe(false);
    });

    it('context.set requires a non-empty name and namespace.set allows clearing', () => {
        expect(ipcSchemas['context.set'].input.safeParse({ name: 'prod' }).success).toBe(true);
        expect(ipcSchemas['context.set'].input.safeParse({ name: '' }).success).toBe(false);
        expect(ipcSchemas['namespace.set'].input.safeParse({ namespace: null }).success).toBe(true);
        expect(ipcSchemas['namespace.set'].input.safeParse({ namespace: 'kube-system' }).success).toBe(true);
        expect(ipcSchemas['namespace.set'].input.safeParse({}).success).toBe(false);
    });

    it('every namespace field is a DNS-1123 label, so an empty string can never mean "all"', () => {
        const namespaced = [
            ['namespace.set', { namespace: '' }],
            ['resources.list', { kind: 'Pod', namespace: '' }],
            ['resources.get', { kind: 'Pod', name: 'web', namespace: '' }],
            ['resources.getYaml', { kind: 'Pod', name: 'web', namespace: 'Team-A' }],
            ['events.list', { namespace: 'a b' }],
            ['events.forObject', { kind: 'Pod', name: 'web', namespace: 'ns/other' }],
            ['pods.logSnapshot', { name: 'web', namespace: '' }],
            ['metrics.podSeries', { name: 'web', namespace: 'a,b' }],
            ['deployments.rollouts', { name: 'web', namespace: '' }],
            ['releases.get', { name: 'traefik', namespace: '' }],
            ['releases.get', { name: 'traefik' }],
        ] as const;
        for (const [channel, input] of namespaced) {
            expect(ipcSchemas[channel].input.safeParse(input).success, `${channel} ${JSON.stringify(input)}`).toBe(
                false,
            );
        }
        expect(ipcSchemas['resources.list'].input.safeParse({ kind: 'Pod', namespace: 'kube-system' }).success).toBe(
            true,
        );
        expect(ipcSchemas['resources.list'].input.safeParse({ kind: 'Pod' }).success).toBe(true);
    });

    it('writes carry a context stamp and name a namespace exactly when the kind is namespaced', () => {
        const del = ipcSchemas['resources.delete'].input;
        expect(del.safeParse({ context: 'alpha', kind: 'ConfigMap', name: 'x', namespace: 'team-a' }).success).toBe(
            true,
        );
        expect(del.safeParse({ kind: 'ConfigMap', name: 'x', namespace: 'team-a' }).success).toBe(false);
        // A namespaced kind without a namespace would fall back to whatever is active: refused.
        expect(del.safeParse({ context: 'alpha', kind: 'ConfigMap', name: 'x' }).success).toBe(false);
        expect(del.safeParse({ context: 'alpha', kind: 'ClusterRole', name: 'x' }).success).toBe(true);
        expect(del.safeParse({ context: 'alpha', kind: 'Node', name: 'n1' }).success).toBe(true);
        expect(del.safeParse({ context: 'alpha', kind: 'ClusterRole', name: 'x', namespace: 'a' }).success).toBe(false);

        const scale = ipcSchemas['resources.scale'].input;
        expect(
            scale.safeParse({ context: 'alpha', kind: 'Deployment', name: 'web', namespace: 'team-a', replicas: 2 })
                .success,
        ).toBe(true);
        expect(scale.safeParse({ context: 'alpha', kind: 'Deployment', name: 'web', replicas: 2 }).success).toBe(false);

        const manifest = ipcSchemas['resources.replace'].input;
        expect(manifest.safeParse({ context: 'alpha', manifest: 'kind: Pod' }).success).toBe(true);
        expect(manifest.safeParse({ manifest: 'kind: Pod' }).success).toBe(false);
        expect(
            manifest.safeParse({
                context: 'alpha',
                manifest: 'kind: Pod',
                expect: { kind: 'Pod', name: 'web', namespace: 'team-a' },
            }).success,
        ).toBe(true);
        expect(
            manifest.safeParse({ context: 'alpha', manifest: 'kind: Pod', expect: { kind: 'Pod', name: 'web' } })
                .success,
        ).toBe(false);
    });

    it('startupChecks output only knows the two check ids and three statuses', () => {
        const output = ipcSchemas['startupChecks'].output;
        const ok = { checks: [{ id: 'kubeconfig', label: 'Kubeconfig file', status: 'ok' }], ok: true };
        expect(output.safeParse(ok).success).toBe(true);
        expect(output.safeParse({ checks: [{ id: 'kubectl', label: 'x', status: 'ok' }], ok: true }).success).toBe(
            false,
        );
        expect(output.safeParse({ checks: [{ id: 'cluster', label: 'x', status: 'meh' }], ok: true }).success).toBe(
            false,
        );
    });

    it('the result envelope is ok with data or not ok with a classified error', () => {
        expect(ipcResultSchema.safeParse({ ok: true, data: 42 }).success).toBe(true);
        expect(
            ipcResultSchema.safeParse({ ok: false, error: { kind: 'forbidden', detail: 'x', op: 'nodes.list' } })
                .success,
        ).toBe(true);
        expect(
            ipcResultSchema.safeParse({ ok: false, error: { kind: 'exploded', detail: 'x', op: 'y' } }).success,
        ).toBe(false);
        expect(ipcResultSchema.safeParse({ ok: false }).success).toBe(false);
    });

    it('update.install reports a boolean result', () => {
        const output = ipcSchemas['update.install'].output;
        expect(output.safeParse({ ok: true }).success).toBe(true);
        expect(output.safeParse({ ok: 'yes' }).success).toBe(false);
    });

    it('types the log snapshot and object events inputs', () => {
        const snapshot = ipcSchemas['pods.logSnapshot'].input;
        expect(snapshot.safeParse({ name: 'web-1', namespace: 'team-a' }).success).toBe(true);
        expect(snapshot.safeParse({ name: 'web-1', namespace: 'team-a', sinceSeconds: 0 }).success).toBe(false);
        expect(snapshot.safeParse({ name: 'web-1' }).success).toBe(false);
        const events = ipcSchemas['events.forObject'];
        expect(events.input.safeParse({ kind: 'Pod', name: 'web-1' }).success).toBe(true);
        expect(events.input.safeParse({ kind: 'Pod', name: '' }).success).toBe(false);
        expect(
            events.output.safeParse([{ time: '12:00:00', type: 'Warning', reason: 'r', object: 'pod/x', message: 'm' }])
                .success,
        ).toBe(true);
        expect(
            events.output.safeParse([{ time: '12:00:00', type: 'Odd', reason: 'r', object: 'pod/x', message: 'm' }])
                .success,
        ).toBe(false);
    });

    it('types the metrics series inputs and alert tones', () => {
        expect(ipcSchemas['metrics.podSeries'].input.safeParse({ namespace: 'team-a', name: 'web-1' }).success).toBe(
            true,
        );
        expect(ipcSchemas['metrics.podSeries'].input.safeParse({ name: 'web-1' }).success).toBe(false);
        expect(ipcSchemas['metrics.nodeSeries'].input.safeParse({ name: '' }).success).toBe(false);
        expect(ipcSchemas['metrics.alerts'].output.safeParse([{ tone: 'info', title: 't', detail: 'd' }]).success).toBe(
            false,
        );
        expect(ipcSchemas['metrics.sparklines'].output.safeParse({ nodes: [], cpu: [], mem: [] }).success).toBe(true);
    });
});
