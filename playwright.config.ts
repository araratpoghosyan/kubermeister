import { defineConfig } from '@playwright/test';

// End-to-end suite: launches the built app (npm run build first) against a disposable k3s cluster
// started in global setup. One worker: the specs share that cluster and the app owns a window.
export default defineConfig({
    testDir: 'tests/e2e/specs',
    globalSetup: './tests/e2e/harness/global-setup.ts',
    globalTeardown: './tests/e2e/harness/global-teardown.ts',
    timeout: 120_000,
    retries: 0,
    workers: 1,
    reporter: [['list']],
});
