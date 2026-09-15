import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = { app: { isPackaged: true } };
vi.mock('electron', () => electron);

class FakeAutoUpdater extends EventEmitter {
    logger: unknown = null;
    autoDownload = false;
    autoInstallOnAppQuit = false;
    checkForUpdates = vi.fn<() => Promise<unknown>>(() => Promise.resolve(null));
    quitAndInstall = vi.fn();
}
const autoUpdater = new FakeAutoUpdater();
vi.mock('electron-updater', () => ({ default: { autoUpdater } }));

const broadcast = vi.fn();
vi.mock('../../../src/main/ipc/push.js', () => ({ broadcast }));

const savedAppImage = process.env.APPIMAGE;
let platform: NodeJS.Platform = 'darwin';
vi.spyOn(process, 'platform', 'get').mockImplementation(() => platform);

async function loadUpdater() {
    vi.resetModules();
    return import('../../../src/main/updater.js');
}

describe('startUpdater', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        electron.app.isPackaged = true;
        platform = 'darwin';
        delete process.env.APPIMAGE;
        autoUpdater.removeAllListeners();
        autoUpdater.checkForUpdates.mockReset().mockResolvedValue(null);
        autoUpdater.quitAndInstall.mockReset();
    });

    afterEach(() => {
        vi.useRealTimers();
        if (savedAppImage === undefined) delete process.env.APPIMAGE;
        else process.env.APPIMAGE = savedAppImage;
    });

    it('is unsupported in development builds', async () => {
        electron.app.isPackaged = false;
        const { startUpdater, getUpdateState } = await loadUpdater();
        startUpdater();
        expect(getUpdateState()).toEqual({ status: 'unsupported', message: 'Development build' });
        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
    });

    it('is unsupported for Linux installs that are not an AppImage', async () => {
        platform = 'linux';
        const { startUpdater, getUpdateState } = await loadUpdater();
        startUpdater();
        expect(getUpdateState().status).toBe('unsupported');
    });

    it('is supported for Linux AppImage installs', async () => {
        platform = 'linux';
        process.env.APPIMAGE = '/home/u/Kubermeister.AppImage';
        const { startUpdater, getUpdateState } = await loadUpdater();
        startUpdater();
        expect(getUpdateState()).toEqual({ status: 'idle' });
    });

    it('configures background download, checks after a delay and then periodically', async () => {
        const { startUpdater } = await loadUpdater();
        startUpdater();
        expect(autoUpdater.autoDownload).toBe(true);
        expect(autoUpdater.autoInstallOnAppQuit).toBe(true);
        expect(autoUpdater.checkForUpdates).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(4 * 60 * 60 * 1000);
        expect(autoUpdater.checkForUpdates).toHaveBeenCalledTimes(2);
    });

    it('tracks the updater lifecycle through its events', async () => {
        const { startUpdater, getUpdateState } = await loadUpdater();
        startUpdater();
        autoUpdater.emit('checking-for-update');
        expect(getUpdateState()).toEqual({ status: 'checking' });
        autoUpdater.emit('update-available', { version: '0.2.0' });
        expect(getUpdateState()).toEqual({ status: 'downloading', version: '0.2.0', percent: 0 });
        autoUpdater.emit('download-progress', { percent: 41.6 });
        expect(getUpdateState()).toEqual({ status: 'downloading', version: '0.2.0', percent: 42 });
        autoUpdater.emit('update-downloaded', { version: '0.2.0' });
        expect(getUpdateState()).toEqual({ status: 'downloaded', version: '0.2.0' });
        autoUpdater.emit('update-not-available');
        expect(getUpdateState()).toEqual({ status: 'up-to-date' });
        autoUpdater.emit('error', new Error('feed unreachable'));
        expect(getUpdateState()).toEqual({ status: 'error', message: 'feed unreachable' });
        // Every transition is pushed to the renderer.
        expect(broadcast).toHaveBeenLastCalledWith('update.state', { status: 'error', message: 'feed unreachable' });
    });

    it('records a failed check as an error state', async () => {
        autoUpdater.checkForUpdates.mockRejectedValue(new Error('offline'));
        const { startUpdater, getUpdateState } = await loadUpdater();
        startUpdater();
        await vi.advanceTimersByTimeAsync(15_000);
        expect(getUpdateState()).toEqual({ status: 'error', message: 'offline' });
    });

    it('installs only when a download is ready', async () => {
        const { startUpdater, installUpdate } = await loadUpdater();
        startUpdater();
        expect(installUpdate()).toBe(false);
        expect(autoUpdater.quitAndInstall).not.toHaveBeenCalled();
        autoUpdater.emit('update-downloaded', { version: '0.2.0' });
        expect(installUpdate()).toBe(true);
        expect(autoUpdater.quitAndInstall).toHaveBeenCalledOnce();
    });
});
