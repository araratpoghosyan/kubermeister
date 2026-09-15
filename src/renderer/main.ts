import { invoke } from './lib/ipc';
import type { StartupCheck, UpdateState } from '../shared/ipc';

const UPDATE_POLL_MS = 30_000;

const root = document.getElementById('app');
if (!root) throw new Error('renderer root element missing');

function el<K extends keyof HTMLElementTagNameMap>(
    tag: K,
    text?: string,
    attrs: Record<string, string> = {},
): HTMLElementTagNameMap[K] {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
}

// --- App identity -------------------------------------------------------------------------------

const info = await invoke('app.info', {});
const heading = el('h1', `${info.name} ${info.version}`);

const rows: Array<[label: string, value: string]> = [
    ['Electron', info.electron],
    ['Chromium', info.chrome],
    ['Node', info.node],
    ['Platform', info.platform],
];
const list = el('dl');
for (const [label, value] of rows) list.append(el('dt', label), el('dd', value));

// --- Startup checks -----------------------------------------------------------------------------

const checksSection = el('section', undefined, { id: 'startup-checks' });
checksSection.append(el('h2', 'Startup checks'));
const checksList = el('ul');
checksSection.append(checksList);

function renderCheck(check: StartupCheck): HTMLLIElement {
    const item = el('li', undefined, { 'data-check': check.id, 'data-status': check.status });
    item.append(el('strong', `${check.label}: `), el('span', check.status));
    if (check.detail) item.append(el('span', ` ${check.detail}`, { class: 'detail' }));
    if (check.hint) item.append(el('em', ` ${check.hint}`));
    return item;
}

// --- Connection ---------------------------------------------------------------------------------

const connection = el('section', undefined, { id: 'connection' });
connection.append(el('h2', 'Connection'));
const currentContext = el('p', undefined, { id: 'current-context' });
const contextSelect = el('select', undefined, { id: 'context-select', 'aria-label': 'Kubernetes context' });
const namespaceLabel = el('p', undefined, { id: 'current-namespace' });
connection.append(currentContext, contextSelect, namespaceLabel);

async function refreshConnection(): Promise<void> {
    const [contexts, current, settings] = await Promise.all([
        invoke('contexts.list', {}),
        invoke('context.current', {}),
        invoke('settings.get', {}),
    ]);
    currentContext.textContent = current ? `Context: ${current.name} (${current.cluster})` : 'No current context';
    contextSelect.replaceChildren(
        ...contexts.map((context) => {
            const option = el('option', context.name, { value: context.name });
            option.selected = context.current;
            return option;
        }),
    );
    namespaceLabel.textContent = `Namespace: ${settings.session.lastNamespace ?? current?.namespace ?? 'all'}`;
}

contextSelect.addEventListener('change', () => {
    void invoke('context.set', { name: contextSelect.value }).then(refreshConnection);
});

// --- Updates ------------------------------------------------------------------------------------

const banner = el('p', undefined, { id: 'update' });
const restart = el('button', 'Restart to update');
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

// --- Boot ---------------------------------------------------------------------------------------

root.append(heading, list, checksSection, connection, banner, restart);

const report = await invoke('startupChecks', {});
checksList.replaceChildren(...report.checks.map(renderCheck));
checksSection.dataset.ok = String(report.ok);
if (report.ok) await refreshConnection();
else connection.hidden = true;

await refreshUpdateBanner();
setInterval(() => void refreshUpdateBanner(), UPDATE_POLL_MS);
