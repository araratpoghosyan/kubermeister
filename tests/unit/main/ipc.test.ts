import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (event: unknown, input: unknown) => Promise<unknown>;
const registered = new Map<string, Listener>();

vi.mock('electron', () => ({
    app: { getName: () => 'Kubermeister', getVersion: () => '0.1.1' },
    ipcMain: { handle: (channel: string, listener: Listener) => registered.set(channel, listener) },
}));

const updater = { getUpdateState: vi.fn(), installUpdate: vi.fn() };
vi.mock('../../../src/main/updater.js', () => updater);

const { registerHandlers } = await import('../../../src/main/ipc/index.js');
const { ipcSchemas } = await import('../../../src/shared/ipc.js');

async function invoke(channel: string, input: unknown): Promise<unknown> {
    const listener = registered.get(channel);
    if (!listener) throw new Error(`no handler for ${channel}`);
    return listener({}, input);
}

describe('registerHandlers', () => {
    // Under plain Node these two runtime versions do not exist; Electron always provides them.
    beforeAll(() => {
        Object.defineProperty(process.versions, 'electron', { value: '44.3.0', configurable: true });
        Object.defineProperty(process.versions, 'chrome', { value: '152.0.0.0', configurable: true });
    });
    afterAll(() => {
        delete (process.versions as Record<string, unknown>).electron;
        delete (process.versions as Record<string, unknown>).chrome;
    });

    beforeEach(() => {
        registered.clear();
        vi.clearAllMocks();
        registerHandlers();
    });

    it('registers one handler per channel in the contract', () => {
        expect([...registered.keys()].sort()).toEqual(Object.keys(ipcSchemas).sort());
    });

    it('answers app.info from the Electron runtime', async () => {
        await expect(invoke('app.info', {})).resolves.toEqual({
            name: 'Kubermeister',
            version: '0.1.1',
            electron: '44.3.0',
            chrome: '152.0.0.0',
            node: process.versions.node,
            platform: process.platform,
        });
    });

    it('rejects input that does not match the channel schema', async () => {
        await expect(invoke('app.info', 'not-an-object')).rejects.toThrow();
    });

    it('rejects handler output that does not match the channel schema', async () => {
        updater.getUpdateState.mockReturnValue({ status: 'exploded' });
        await expect(invoke('update.state', {})).rejects.toThrow();
    });

    it('forwards update.state and update.install to the updater', async () => {
        updater.getUpdateState.mockReturnValue({ status: 'downloaded', version: '0.2.0' });
        updater.installUpdate.mockReturnValue(true);
        await expect(invoke('update.state', {})).resolves.toEqual({ status: 'downloaded', version: '0.2.0' });
        await expect(invoke('update.install', {})).resolves.toEqual({ ok: true });
        expect(updater.installUpdate).toHaveBeenCalledOnce();
    });
});
