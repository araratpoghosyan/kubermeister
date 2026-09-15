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
    await expect(summary.locator('[data-metric="Nodes"]')).toContainText('1');
    await expect(summary.getByTestId('workload-health')).toContainText('live · ~12s samples');
    await expect(summary.getByTestId('recent-events')).toContainText('Scheduled');
});

test('lists the k3s node as Ready and the seeded namespace', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Nodes' }).click();
    const nodes = window.getByTestId('nodes-table');
    await expect(nodes.getByRole('row')).toHaveCount(2);
    await expect(nodes).toContainText('Ready');
    await expect(nodes).toContainText('control-plane');
    // Usage meters fill in once metrics-server has reported the node; until then the cell says so.
    await expect(
        nodes.getByRole('progressbar', { name: 'CPU usage' }).or(nodes.getByText('no data').first()),
    ).toBeVisible();

    await nodes.locator('[data-node]').first().getByRole('link').click();
    const nodePage = window.getByTestId('node-page');
    await expect(nodePage).toContainText('role: control-plane');
    await window.getByRole('tab', { name: 'System info' }).click();
    await expect(nodePage.getByTestId('system-info')).toContainText('v1.36.4+k3s1');
    await window.getByRole('tab', { name: /Conditions/ }).click();
    await expect(nodePage.getByTestId('node-conditions')).toContainText('Ready: True');
    await window.getByTestId('sidebar').getByRole('link', { name: 'Nodes' }).click();

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
    // The seeded container declares limits, so usage renders as a meter even before the first sample.
    await expect(row.getByRole('progressbar', { name: 'CPU usage' })).toBeVisible();
    await expect(row.getByRole('progressbar', { name: 'Memory usage' })).toBeVisible();

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

test('opens the command palette from the keyboard and jumps to a screen', async () => {
    const { window } = launched;
    await window.keyboard.press(process.platform === 'darwin' ? 'Meta+k' : 'Control+k');
    const palette = window.getByRole('dialog', { name: 'Quick actions' });
    await expect(palette).toBeVisible();
    await expect(palette.getByRole('option', { name: 'km-e2e-ctx' })).toBeVisible();
    await palette.getByPlaceholder('Switch cluster, namespace or resource…').fill('nodes');
    await palette.getByRole('option', { name: 'Nodes' }).click();
    await expect(window.getByTestId('nodes-table')).toBeVisible();
    await expect(palette).toBeHidden();
});

test('opens Settings from the sidebar and switches the theme', async () => {
    const { window } = launched;
    await window
        .getByTestId('sidebar')
        .getByRole('link', { name: /Settings/ })
        .click();
    const page = window.getByTestId('settings-page');
    await expect(page).toContainText('Preferences for this Kubermeister install.');
    await expect(page.getByTestId('kubeconfig-path')).toContainText('.kubeconfig');
    await page.getByRole('radio', { name: /Light/ }).click();
    await expect(window.locator('html')).toHaveClass(/light/);
    await page.getByRole('radio', { name: /Dark/ }).click();
    await expect(window.locator('html')).toHaveClass(/dark/);
});

test('lists the seeded deployment and opens its rollout history', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Deployments' }).click();
    const row = window.getByTestId('deployments-table').locator('[data-deployment="web"]');
    await expect(row).toContainText('1/1');
    await expect(row).toContainText('Healthy');
    await expect(row).toContainText('busybox:1.36');
    await row.getByRole('link').click();
    const page = window.getByTestId('deployment-page');
    await expect(page).toContainText('namespace: km-e2e');
    await expect(page).toContainText('strategy: RollingUpdate');
    await window.getByRole('tab', { name: /History/ }).click();
    await expect(page.getByTestId('rollout-history')).toContainText('Current');
    await window.getByRole('tab', { name: /ReplicaSets/ }).click();
    await expect(page.getByTestId('replica-sets').getByRole('row')).toHaveCount(2);
});

test('lists the seeded job and cron job and opens the job detail', async () => {
    const { window } = launched;
    // Exact: "Jobs" is a substring of "CronJobs", and both links sit in the sidebar.
    await window.getByTestId('sidebar').getByRole('link', { name: 'Jobs', exact: true }).click();
    const job = window.getByTestId('jobs-table').locator('[data-job="import"]');
    await expect(job).toContainText('1/1', { timeout: 30_000 });
    await expect(job).toContainText('Complete', { timeout: 30_000 });
    await job.getByRole('link').click();
    const page = window.getByTestId('job-page');
    await expect(page).toContainText('completions: 1/1');
    await expect(page).toContainText('Completions');

    await window.getByTestId('sidebar').getByRole('link', { name: 'CronJobs' }).click();
    const cron = window.getByTestId('cronjobs-table').locator('[data-cronjob="nightly"]');
    await expect(cron).toContainText('0 2 * * *');
    await expect(cron).toContainText('true');
});

test('shows config map entries and masks secret values', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'ConfigMaps' }).click();
    await window.getByTestId('configmaps-table').locator('[data-configmap="app-config"]').getByRole('link').click();
    const configMap = window.getByTestId('configmap-page');
    await expect(configMap).toContainText('keys: 2');
    await window.getByRole('tab', { name: /Entries/ }).click();
    const entries = configMap.getByTestId('configmap-entries');
    await expect(entries).toContainText('LOG_LEVEL');
    await expect(entries).toContainText('debug');
    await expect(entries).toContainText('hello-from-e2e');

    await window.getByTestId('sidebar').getByRole('link', { name: 'Secrets' }).click();
    await window.getByTestId('secrets-table').locator('[data-secret="app-secret"]').getByRole('link').click();
    const secret = window.getByTestId('secret-page');
    await expect(secret).toContainText('type: Opaque');
    await window.getByRole('tab', { name: /Keys/ }).click();
    await expect(secret.getByTestId('secret-keys').getByRole('cell', { name: 'password' })).toBeVisible();
    await expect(window.getByText(/super-secret-value/)).toHaveCount(0);
});

test('shows the events stream, the namespace quota and its limit range', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Events stream' }).click();
    const events = window.getByTestId('events-table');
    await expect(events.getByRole('row')).not.toHaveCount(1, { timeout: 30_000 });
    await expect(events).toContainText('pod/');

    await window.getByTestId('sidebar').getByRole('link', { name: 'Quotas' }).click();
    const quotas = window.getByTestId('quotas-table');
    await expect(quotas).toContainText('team-quota');
    await expect(quotas).toContainText('requests.cpu');
    await expect(quotas.getByRole('progressbar').first()).toBeVisible();

    await window.getByTestId('sidebar').getByRole('link', { name: 'Limits' }).click();
    const limits = window.getByTestId('limits-table');
    await expect(limits).toContainText('team-limits');
    await expect(limits).toContainText('Container');
    await expect(limits).toContainText('500m');
});

test('lists the seeded service and opens its ports and endpoints', async () => {
    const { window } = launched;
    await window.getByTestId('sidebar').getByRole('link', { name: 'Services' }).click();
    const row = window.getByTestId('services-table').locator('[data-service="web"]');
    await expect(row).toContainText('ClusterIP');
    await expect(row).toContainText('80/TCP');
    await row.getByRole('link').click();
    const page = window.getByTestId('service-page');
    await expect(page).toContainText('type: ClusterIP');
    await window.getByRole('tab', { name: /Ports/ }).click();
    await expect(page.getByTestId('service-ports')).toContainText('8080');
    await window.getByRole('tab', { name: /^Endpoints/ }).click();
    await expect(page.getByTestId('service-endpoints')).toContainText('Ready', { timeout: 30_000 });
    await window.getByRole('tab', { name: /Selector/ }).click();
    await expect(page).toContainText('app');
});
