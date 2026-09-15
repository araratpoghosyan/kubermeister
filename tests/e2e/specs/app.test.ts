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

test('launches against the isolated cluster and passes the startup gate', async () => {
    const { window } = launched;
    await expect(window).toHaveTitle('Kubermeister');
    const checks = window.locator('#startup-checks');
    await expect(checks).toHaveAttribute('data-ok', 'true');
    await expect(checks.locator('li[data-check="kubeconfig"]')).toHaveAttribute('data-status', 'ok');
    const cluster = checks.locator('li[data-check="cluster"]');
    await expect(cluster).toHaveAttribute('data-status', 'ok');
    await expect(cluster).toContainText(`Connected to ${CONTEXT_NAME}`);
});

test('shows the test context and namespace and offers no other context', async () => {
    const { window } = launched;
    await expect(window.locator('#current-context')).toContainText(`Context: ${CONTEXT_NAME}`);
    await expect(window.locator('#current-namespace')).toHaveText(`Namespace: ${NAMESPACE}`);
    await expect(window.locator('#context-select option')).toHaveText([CONTEXT_NAME]);
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
    const nodes = (result as { data: Array<{ name: string; status: string; role: string }> }).data;
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({ status: 'Ready' });
    expect(nodes[0]?.role).toContain('control-plane');
});
