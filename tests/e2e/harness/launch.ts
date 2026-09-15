import { _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CONTEXT_NAME, KUBECONFIG_PATH, NAMESPACE } from './cluster';

export interface LaunchedApp {
    app: ElectronApplication;
    window: Page;
    /** The throwaway data directory the app was pointed at. */
    userData: string;
}

/**
 * Launch the built app against the isolated cluster. A throwaway user-data directory keeps the
 * real settings out of reach, and the seeded settings pin the kubeconfig, context and namespace
 * so every spec starts from the same deterministic state. `KUBECONFIG` is set as well so even a
 * code path that ignored settings could only reach the test cluster.
 */
export async function launchApp(): Promise<LaunchedApp> {
    const userData = mkdtempSync(join(tmpdir(), 'km-e2e-'));
    writeFileSync(
        join(userData, 'settings.json'),
        JSON.stringify({
            version: 1,
            session: { lastContext: CONTEXT_NAME, lastNamespace: NAMESPACE, restoreOnLaunch: true },
            connection: { kubeconfigPath: KUBECONFIG_PATH },
        }),
    );
    const app = await electron.launch({
        args: ['out/main/index.mjs'],
        env: { ...process.env, KUBERMEISTER_USER_DATA: userData, KUBECONFIG: KUBECONFIG_PATH },
    });
    const window = await app.firstWindow();
    return { app, window, userData };
}
