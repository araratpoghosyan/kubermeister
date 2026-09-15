import { invoke } from './lib/ipc';
import type { UpdateState } from '../shared/ipc';

const UPDATE_POLL_MS = 30_000;

const root = document.getElementById('app');
if (!root) throw new Error('renderer root element missing');

const info = await invoke('app.info', {});

const heading = document.createElement('h1');
heading.textContent = `${info.name} ${info.version}`;

const rows: Array<[label: string, value: string]> = [
    ['Electron', info.electron],
    ['Chromium', info.chrome],
    ['Node', info.node],
    ['Platform', info.platform],
];

const list = document.createElement('dl');
for (const [label, value] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.textContent = value;
    list.append(dt, dd);
}

// Update banner: main owns the updater and exposes its state; the renderer polls and renders it.
const banner = document.createElement('p');
banner.id = 'update';
const restart = document.createElement('button');
restart.textContent = 'Restart to update';
restart.hidden = true;
restart.addEventListener('click', () => {
    void invoke('update.install', {});
});

function describe(update: UpdateState): string {
    switch (update.status) {
        case 'unsupported':
            return `Updates: ${update.message ?? 'unavailable'}`;
        case 'idle':
        case 'checking':
            return 'Checking for updates…';
        case 'up-to-date':
            return 'Up to date';
        case 'downloading':
            return `Downloading ${update.version ?? 'update'}… ${update.percent ?? 0}%`;
        case 'downloaded':
            return `Version ${update.version ?? ''} is ready to install.`;
        case 'error':
            return `Update check failed: ${update.message ?? 'unknown error'}`;
    }
}

async function refreshUpdateBanner(): Promise<void> {
    const update = await invoke('update.state', {});
    banner.textContent = describe(update);
    restart.hidden = update.status !== 'downloaded';
}

root.append(heading, list, banner, restart);
await refreshUpdateBanner();
setInterval(() => void refreshUpdateBanner(), UPDATE_POLL_MS);
