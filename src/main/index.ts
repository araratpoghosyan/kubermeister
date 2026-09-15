import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerHandlers } from './ipc/index.js';
import { registerStreamHandlers } from './ipc/streams.js';
import { stopSampler } from './k8s/sampler.js';
import { installApplicationMenu } from './menu.js';
import { isExternalWebUrl, isInternalNavigation } from './security.js';
import { startUpdater } from './updater.js';

// Tests redirect all per-user state (settings, caches) into a throwaway directory so the real
// installation is never read or written.
if (process.env.KUBERMEISTER_USER_DATA) app.setPath('userData', process.env.KUBERMEISTER_USER_DATA);

// Packaged builds take their name from electron-builder's productName ("Kubermeister" or
// "Kubermeister Tip"), which also separates their settings folders. Only development, which runs
// from Electron's own bundle, needs the name set by hand.
if (!app.isPackaged) app.setName('Kubermeister');

function createWindow(): BrowserWindow {
    const window = new BrowserWindow({
        width: 1200,
        height: 800,
        show: false,
        webPreferences: {
            preload: join(__dirname, '../preload/index.cjs'),
            sandbox: true,
            contextIsolation: true,
            nodeIntegration: false,
        },
    });

    // End-to-end runs on a developer machine show the window without taking focus, so keystrokes
    // meant for the terminal never land in the app under test.
    window.on('ready-to-show', () => (process.env.KUBERMEISTER_SHOW_INACTIVE ? window.showInactive() : window.show()));

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalWebUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    const guardNavigation = (event: Electron.Event, url: string): void => {
        if (isInternalNavigation(url, process.env.ELECTRON_RENDERER_URL)) return;
        event.preventDefault();
        if (isExternalWebUrl(url)) void shell.openExternal(url);
    };
    window.webContents.on('will-navigate', guardNavigation);
    window.webContents.on('will-redirect', guardNavigation);

    if (process.env.ELECTRON_RENDERER_URL) {
        void window.loadURL(process.env.ELECTRON_RENDERER_URL);
    } else {
        void window.loadFile(join(__dirname, '../renderer/index.html'));
    }

    return window;
}

void app.whenReady().then(() => {
    installApplicationMenu();
    registerHandlers();
    registerStreamHandlers();
    startUpdater();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('will-quit', () => stopSampler());

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
