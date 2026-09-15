import { describe, expect, it, vi } from 'vitest';
import { stream } from '../../../src/renderer/lib/ipc';

describe('renderer stream', () => {
    it('forwards to the bridge and returns its handle', () => {
        const handle = { stop: vi.fn(), send: vi.fn() };
        const bridge = vi.fn(() => handle);
        vi.stubGlobal('window', { km: { invoke: vi.fn(), subscribe: vi.fn(), stream: bridge } });
        const onMessage = vi.fn();
        const returned = stream('resources.watch', { kind: 'Pod' }, onMessage);
        expect(bridge).toHaveBeenCalledWith('resources.watch', { kind: 'Pod' }, onMessage);
        expect(returned).toBe(handle);
    });
});
