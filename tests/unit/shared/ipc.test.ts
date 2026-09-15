import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../../../src/shared/ipc-channels';
import { ipcSchemas } from '../../../src/shared/ipc';

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
        expect(ipcSchemas['namespace.set'].input.safeParse({}).success).toBe(false);
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

    it('update.install reports a boolean result', () => {
        const output = ipcSchemas['update.install'].output;
        expect(output.safeParse({ ok: true }).success).toBe(true);
        expect(output.safeParse({ ok: 'yes' }).success).toBe(false);
    });
});
