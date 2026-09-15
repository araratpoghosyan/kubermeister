import { describe, expect, it, vi } from 'vitest';
import { subscribe } from '../../../src/renderer/lib/ipc';

describe('renderer subscribe', () => {
    it('forwards to the bridge and returns its unsubscribe function', () => {
        const unsubscribe = vi.fn();
        const bridge = vi.fn(() => unsubscribe);
        vi.stubGlobal('window', { km: { invoke: vi.fn(), subscribe: bridge } });
        const handler = vi.fn();
        const stop = subscribe('update.state', handler);
        expect(bridge).toHaveBeenCalledWith('update.state', handler);
        stop();
        expect(unsubscribe).toHaveBeenCalledOnce();
    });
});
