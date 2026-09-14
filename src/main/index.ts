import { app, BrowserWindow, shell } from 'electron';
import { join } from 'node:path';
import { registerHandlers } from './ipc/index.js';

// Packaged builds take their name from electron-builder's productName ("Kubermeister" or
// "Kubermeister Tip"), which also separates their settings folders. Only development, which runs
// from Electron's own bundle, needs the name set by hand.
if (!app.isPackaged) app.setName('Kubermeister');

/** Only `http:`/`https:` URLs are safe to hand to the OS browser. */
function isExternalWebUrl(url: string): boolean {
    try {
        const { protocol } = new URL(url);
        return protocol === 'http:' || protocol === 'https:';
    } catch {
        return false;
    }
}

/**
 * A navigation is internal only if it targets the app's own document: the Vite dev server in
 * development or the packaged `file://` bundle. Anything else is denied so a compromised renderer
 * cannot navigate the top frame to a remote origin that would inherit the bridge.
 */
function isInternalNavigation(url: string): boolean {
    const devUrl = process.env.ELECTRON_RENDERER_URL;
    return devUrl ? url.startsWith(devUrl) : url.startsWith('file://');
}

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

    window.on('ready-to-show', () => window.show());

    window.webContents.setWindowOpenHandler(({ url }) => {
        if (isExternalWebUrl(url)) void shell.openExternal(url);
        return { action: 'deny' };
    });

    const guardNavigation = (event: Electron.Event, url: string): void => {
        if (isInternalNavigation(url)) return;
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
    registerHandlers();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
