import { afterEach, describe, expect, it, vi } from 'vitest';
import { IpcError, invoke } from '../../../src/renderer/lib/ipc';

const bridge = vi.fn();
vi.stubGlobal('window', { km: { invoke: bridge } });

describe('renderer invoke', () => {
    afterEach(() => bridge.mockReset());

    it('unwraps the ok envelope into the data', async () => {
        bridge.mockResolvedValue({ ok: true, data: { name: 'Kubermeister', version: '0.1.1' } });
        await expect(invoke('app.info', {})).resolves.toEqual({ name: 'Kubermeister', version: '0.1.1' });
        expect(bridge).toHaveBeenCalledWith('app.info', {});
    });

    it('rethrows a classified failure as a typed IpcError', async () => {
        bridge.mockResolvedValue({
            ok: false,
            error: { kind: 'forbidden', detail: 'Access denied (RBAC).', op: 'nodes.list' },
        });
        const error = await invoke('nodes.list', {}).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(IpcError);
        expect(error).toMatchObject({
            name: 'IpcError',
            kind: 'forbidden',
            detail: 'Access denied (RBAC).',
            op: 'nodes.list',
            message: 'Access denied (RBAC).',
        });
    });

    it('lets bridge rejections propagate untouched', async () => {
        bridge.mockRejectedValue(new Error('blocked IPC channel: evil'));
        await expect(invoke('app.info', {})).rejects.toThrow('blocked IPC channel: evil');
    });
});
