import type { StartupCheck, StartupReport } from '../../shared/ipc.js';
import { apis, kubeconfigError } from '../k8s/client.js';
import { getCurrentContext } from '../k8s/context.js';
import { withK8s } from '../k8s/errors.js';

/** A probe against an unreachable API server must not hang the startup screen. */
const CLUSTER_PROBE_TIMEOUT_MS = 5_000;

/**
 * The kubeconfig the app will load must exist and parse. Unlike an offline cluster, nothing works
 * until this is fixed, so it is a hard error with a pointer to the fix. A settings override that
 * fails offers a reset to the default; a broken default has to be fixed on disk.
 */
export function checkKubeconfig(): StartupCheck {
    const base = { id: 'kubeconfig', label: 'Kubeconfig file' } as const;
    const problem = kubeconfigError();
    if (problem) {
        return {
            ...base,
            status: 'error',
            detail: problem,
            hint: problem.startsWith('The default')
                ? 'Fix your default kubeconfig ($KUBECONFIG or ~/.kube/config).'
                : 'Fix or clear the kubeconfig path in Settings.',
        };
    }
    return { ...base, status: 'ok', detail: 'Kubeconfig loaded' };
}

/**
 * Probe the active context. Reachability problems are a warning, never an error: the current
 * context may legitimately be offline and the user can switch contexts once inside.
 */
export async function checkCluster(): Promise<StartupCheck> {
    const base = { id: 'cluster', label: 'Cluster connection' } as const;
    try {
        const context = getCurrentContext();
        if (!context) {
            return {
                ...base,
                status: 'warning',
                detail: 'No current context is set in your kubeconfig.',
                hint: 'Select a context once the app is open.',
            };
        }
        const info = await withK8s('startup.version', () => apis().version.getCode(), CLUSTER_PROBE_TIMEOUT_MS);
        return { ...base, status: 'ok', detail: `Connected to ${context.name} (Kubernetes ${info.gitVersion})` };
    } catch (error) {
        return {
            ...base,
            status: 'warning',
            detail: error instanceof Error ? error.message.replace(/^\[\w+\] /, '') : String(error),
            hint: 'The app opens anyway; switch to a reachable context or fix the connection.',
        };
    }
}

/** Run every check; the report is ok when nothing is an error. */
export async function runStartupChecks(): Promise<StartupReport> {
    const kubeconfig = checkKubeconfig();
    // Without a loadable kubeconfig the probe cannot even start; report that plainly.
    const cluster =
        kubeconfig.status === 'error'
            ? {
                  id: 'cluster' as const,
                  label: 'Cluster connection',
                  status: 'warning' as const,
                  detail: 'Skipped: the kubeconfig could not be loaded.',
              }
            : await checkCluster();
    const checks = [kubeconfig, cluster];
    return { checks, ok: checks.every((check) => check.status !== 'error') };
}
