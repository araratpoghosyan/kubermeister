import { invoke } from './lib/ipc';

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

root.append(heading, list);
