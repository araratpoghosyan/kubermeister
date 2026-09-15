import { expect, test } from '@playwright/test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { CONTEXT_NAME, NAMESPACE } from '../harness/cluster';
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
    await expect(row).toContainText(NAMESPACE);

    await row.getByRole('link').click();
    const detail = window.getByTestId('pod-detail');
    await expect(detail).toContainText('busybox:1.36');
    await expect(detail.getByTestId('containers-table').locator('[data-container="web"]')).toContainText('Running');
    await expect(detail).toContainText('8080/TCP');

    await window.getByTestId('sidebar').getByRole('link', { name: 'Pods' }).click();
    await window.getByTestId('namespace-selector').click();
    await window.getByRole('option', { name: 'kube-system' }).click();
    await expect(window.getByTestId('active-namespace')).toContainText('kube-system');
    await expect(window.getByTestId('pods-table').locator('[data-pod^="web-"]')).toHaveCount(0);
    await expect(window.getByTestId('pods-table').locator('[data-pod^="coredns-"]')).toHaveCount(1);
});
