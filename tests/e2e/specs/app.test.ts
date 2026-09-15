import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTEXT_NAME, NAMESPACE, clusterKubectl } from '../harness/cluster';
import { launchApp, type LaunchedApp } from '../harness/launch';

let launched: LaunchedApp;

test.beforeEach(async () => {
    launched = await launchApp();
});

test.afterEach(async () => {
    await launched.app.close();
});

test('passes the startup gate against the isolated cluster and shows the shell', async () => {
    const { window } = launched;
    await expect(window).toHaveTitle('Kubermeister');
    await expect(window.getByTestId('app-shell')).toBeVisible();
    await expect(window.getByTestId('context-selector')).toHaveText(CONTEXT_NAME);
    await expect(window.getByTestId('active-namespace')).toContainText(NAMESPACE);
});

test('shows the cluster summary for the test context', async () => {
    const { window } = launched;
    const summary = window.getByTestId('cluster-summary');
    await expect(summary).toContainText(CONTEXT_NAME);
    await expect(summary).toContainText('Healthy');
    await expect(summary.getByText('1', { exact: true })).toBeVisible();
});

test('lists the k3s node as Ready and the seeded namespace', async () => {
    const { window } = launched;
    await window.getByRole('link', { name: 'Nodes' }).click();
    const nodes = window.getByTestId('nodes-table');
    await expect(nodes.getByRole('row')).toHaveCount(2);
    await expect(nodes).toContainText('Ready');
    await expect(nodes).toContainText('control-plane');

    await window.getByRole('link', { name: 'Namespaces' }).click();
    const namespaces = window.getByTestId('namespaces-table');
    await expect(namespaces.locator(`[data-namespace="${NAMESPACE}"]`)).toContainText('Active');
    await expect(namespaces.locator('[data-namespace="kube-system"]')).toBeVisible();
});

test('keeps all per-user state inside the throwaway data directory', async () => {
    const { app, userData } = launched;
    const actual = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'));
    expect(actual).toBe(userData);
    expect(existsSync(join(userData, 'settings.json'))).toBe(true);
});

test('reads the cluster node list through the bridge', async () => {
    const { window } = launched;
    const result = await window.evaluate(() => window.km.invoke('nodes.list', {}));
    expect(result).toMatchObject({ ok: true });
    const nodes = (result as { data: Array<{ status: string; role: string }> }).data;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ status: 'Ready' });
});

test('lists the seeded pod, opens its detail, and rescopes by namespace', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Pods' }).click();
    const pods = window.getByTestId('pods-table');
    const row = pods.locator('[data-pod^="web-"]');
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Running');

    await row.getByRole('link').click();
    // The header carries the namespace; the list only shows a Namespace column across namespaces.
    const page = window.getByTestId('pod-page');
    await expect(page).toContainText(`namespace: ${NAMESPACE}`);
    const containers = page.getByTestId('containers');
    await expect(containers).toContainText('busybox:1.36');
    await expect(containers.locator('[data-container="web"]')).toContainText('Running');
    await window.getByRole('tab', { name: 'Events' }).click();
    await expect(page.getByTestId('object-events')).toContainText('Scheduled');
    await window.getByRole('tab', { name: 'Network' }).click();
    await expect(page.getByTestId('network')).toContainText('8080/TCP');

    await window.getByTestId('sidebar').getByRole('link', { name: 'Pods' }).click();
    await window.getByTestId('namespace-selector').click();
    await window.getByRole('option', { name: 'kube-system' }).click();
    await expect(window.getByTestId('active-namespace')).toContainText('kube-system');
    await expect(window.getByTestId('pods-table').locator('[data-pod^="web-"]')).toHaveCount(0);
    await expect(window.getByTestId('pods-table').locator('[data-pod^="coredns-"]')).toHaveCount(1);
});

test('keeps the pod list live: a deleted pod disappears and its replacement appears', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Pods' }).click();
    const page = window.getByTestId('pods-page');
    const rows = page.locator('[data-pod^="web-"]');
    await expect(rows).toHaveCount(1);
    await expect(page).toHaveAttribute('data-live', 'true');
    const victim = await rows.first().getAttribute('data-pod');
    expect(victim).toBeTruthy();

    clusterKubectl(['-n', NAMESPACE, 'delete', 'pod', victim!, '--wait=false']);

    await expect(page.locator(`[data-pod="${victim}"]`)).toHaveCount(0, { timeout: 45_000 });
    const replacement = page.locator('[data-pod^="web-"]');
    await expect(replacement).toHaveCount(1, { timeout: 45_000 });
    await expect(replacement).toContainText('Running', { timeout: 60_000 });
    expect(await replacement.getAttribute('data-pod')).not.toBe(victim);
});

test('follows pod logs, runs a command in the pod shell, and starts a port-forward', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Pods' }).click();
    await window.getByTestId('pods-table').locator('[data-pod^="web-"]').getByRole('link').click();
    await expect(window.getByTestId('pod-page')).toBeVisible();

    await window.getByRole('tab', { name: 'Logs' }).click();
    const viewer = window.getByTestId('log-viewer');
    // The snapshot read shows recent lines first; Live switches to the follow stream.
    await expect(viewer.getByRole('list', { name: 'Log lines' })).toContainText('km-e2e-marker', { timeout: 30_000 });
    await expect(viewer).toHaveAttribute('data-live', 'false');
    await window.getByRole('button', { name: 'Live' }).click();
    await expect(viewer).toHaveAttribute('data-live', 'true', { timeout: 30_000 });
    await expect(viewer.getByRole('list', { name: 'Log lines' })).toContainText('km-e2e-marker', { timeout: 30_000 });

    await window.getByRole('tab', { name: 'Shell' }).click();
    const terminal = window.getByTestId('terminal-host');
    await expect(terminal.locator('.xterm')).toBeVisible();
    await terminal.click();
    await window.keyboard.type('echo km-shell-$((6*7))\n');
    await expect(terminal).toContainText('km-shell-42', { timeout: 30_000 });

    await window.getByRole('tab', { name: 'Network' }).click();
    await window.getByRole('textbox', { name: 'Local port' }).fill('38080');
    await window.getByRole('button', { name: 'Start' }).click();
    await expect(window.getByTestId('port-forward-status')).toContainText('Listening on 127.0.0.1:38080 → 8080', {
        timeout: 15_000,
    });
    await window.getByRole('button', { name: 'Stop' }).click();
    await expect(window.getByRole('button', { name: 'Start' })).toBeVisible();
});
