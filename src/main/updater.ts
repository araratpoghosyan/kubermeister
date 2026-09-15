import { app } from 'electron';
import electronUpdater from 'electron-updater';
import type { UpdateState } from '../shared/ipc.js';

// electron-updater is CommonJS; named imports are not reliably detected from ESM, so destructure.
const { autoUpdater } = electronUpdater;

const FIRST_CHECK_DELAY_MS = 15_000;
const CHECK_INTERVAL_MS = 4 * 60 * 60 * 1000;

let state: UpdateState = { status: 'idle' };

function setState(next: UpdateState): void {
    state = next;
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Why the updater cannot run in this build, or `null` when it can. The update feed (GitHub releases
 * for stable, the tip download URL for nightly) is embedded by electron-builder at package time, so
 * development builds have nothing to check against. Linux deb packages are managed by apt and only
 * the AppImage can replace itself.
 */
function unsupportedReason(): string | null {
    if (!app.isPackaged) return 'Development build';
    if (process.platform === 'linux' && !process.env.APPIMAGE) return 'Installed from a .deb package';
    return null;
}

/**
 * Checks on a delay after launch and every few hours after that. Updates download in the background
 * and install on quit; the renderer can also ask for an immediate restart through `installUpdate`.
 */
export function startUpdater(): void {
    const reason = unsupportedReason();
    if (reason) {
        setState({ status: 'unsupported', message: reason });
        return;
    }

    autoUpdater.logger = console;
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    autoUpdater.on('checking-for-update', () => setState({ status: 'checking' }));
    autoUpdater.on('update-not-available', () => setState({ status: 'up-to-date' }));
    autoUpdater.on('update-available', (info) =>
        setState({ status: 'downloading', version: info.version, percent: 0 }),
    );
    autoUpdater.on('download-progress', (progress) =>
        setState({ status: 'downloading', version: state.version, percent: Math.round(progress.percent) }),
    );
    autoUpdater.on('update-downloaded', (info) => setState({ status: 'downloaded', version: info.version }));
    autoUpdater.on('error', (error) => setState({ status: 'error', message: errorMessage(error) }));

    const check = (): void => {
        autoUpdater.checkForUpdates().catch((error: unknown) => {
            setState({ status: 'error', message: errorMessage(error) });
        });
    };
    setTimeout(check, FIRST_CHECK_DELAY_MS);
    setInterval(check, CHECK_INTERVAL_MS);
}

export function getUpdateState(): UpdateState {
    return state;
}

/** Quits and installs a downloaded update. Returns false when nothing is ready. */
export function installUpdate(): boolean {
    if (state.status !== 'downloaded') return false;
    autoUpdater.quitAndInstall();
    return true;
}
