import { describe, expect, it, vi } from 'vitest';

const windows: Array<{ isDestroyed: () => boolean; webContents: { send: ReturnType<typeof vi.fn> } }> = [];
vi.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => windows } }));

const { broadcast } = await import('../../../src/main/ipc/push.js');

describe('broadcast', () => {
    it('validates the payload and sends it to every live window', () => {
        const live = { isDestroyed: () => false, webContents: { send: vi.fn() } };
        const dead = { isDestroyed: () => true, webContents: { send: vi.fn() } };
        windows.splice(0, windows.length, live, dead);
        broadcast('update.state', { status: 'downloaded', version: '0.2.0' });
        expect(live.webContents.send).toHaveBeenCalledWith('sub.update.state', {
            status: 'downloaded',
            version: '0.2.0',
        });
        expect(dead.webContents.send).not.toHaveBeenCalled();
    });

    it('refuses a payload that does not match the channel schema', () => {
        windows.splice(0, windows.length);
        expect(() => broadcast('update.state', { status: 'exploded' } as never)).toThrow();
    });
});
