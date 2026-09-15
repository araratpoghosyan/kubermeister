import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { CONTEXT_NAME, KUBECONFIG_PATH } from './cluster';

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

/**
 * The guard behind the rule that no test ever touches a real cluster. Returns the reason a
 * kubeconfig must not be used, or null when every fact points at the disposable container: the
 * file lives inside the repo's test tree and outside ~/.kube, its only named entries are the test
 * context, and every server is a loopback address, which is where Testcontainers maps k3s.
 */
export function isolationViolation(
    kubeconfigPath: string,
    kubeconfigText: string,
    options: { testTree: string; kubeDir: string; contextName: string },
): string | null {
    if (!kubeconfigPath.startsWith(options.testTree))
        return `kubeconfig path ${kubeconfigPath} is outside ${options.testTree}`;
    if (kubeconfigPath.startsWith(options.kubeDir))
        return `kubeconfig path ${kubeconfigPath} is inside ${options.kubeDir}`;

    const current = kubeconfigText.match(/^current-context:\s*(\S+)/m)?.[1];
    if (current !== options.contextName)
        return `current-context is ${current ?? 'unset'}, expected ${options.contextName}`;

    const names = [...kubeconfigText.matchAll(/^\s*-\s+name:\s*(\S+)\s*$/gm)].map((m) => m[1]);
    const foreign = names.filter((name) => name !== options.contextName);
    if (foreign.length > 0) return `kubeconfig names entries other than the test context: ${foreign.join(', ')}`;

    const servers = [...kubeconfigText.matchAll(/^\s*server:\s*(\S+)/gm)].map((m) => m[1]);
    if (servers.length === 0) return 'kubeconfig has no server entry';
    for (const server of servers) {
        let host: string;
        try {
            host = new URL(server).hostname;
        } catch {
            return `server ${server} is not a valid URL`;
        }
        if (!LOOPBACK_HOSTS.has(host)) return `server ${server} is not a loopback address`;
    }
    return null;
}

/** Aborts the whole suite unless the kubeconfig the harness wrote is provably the test cluster's. */
export function assertIsolatedKubeconfig(): void {
    const violation = isolationViolation(KUBECONFIG_PATH, readFileSync(KUBECONFIG_PATH, 'utf8'), {
        testTree: resolve('tests/e2e'),
        kubeDir: resolve(homedir(), '.kube'),
        contextName: CONTEXT_NAME,
    });
    if (violation) throw new Error(`[e2e] isolation guard failed: ${violation}. Refusing to run the suite.`);
}
