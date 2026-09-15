import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { K3sContainer, type StartedK3sContainer } from '@testcontainers/k3s';

/**
 * The isolated end-to-end cluster: one k3s container managed by Testcontainers, which picks a
 * free host port, waits for readiness, and runs its reaper so the container disappears even if
 * the test process crashes. Nothing is installed on the host: kubectl runs inside the container
 * through `docker exec`, and the kubeconfig is written to a gitignored file, so the developer's
 * own kubeconfig is never read or written.
 */

export const K3S_IMAGE = 'rancher/k3s:v1.36.4-k3s1';
export const CONTEXT_NAME = 'km-e2e-ctx';
export const NAMESPACE = 'km-e2e';
export const KUBECONFIG_PATH = resolve('tests/e2e/.kubeconfig');
export const CONTAINER_NAME = 'km-e2e-cluster';
/** Keep the container between runs (skips the cluster boot); remove with `docker rm -f km-e2e-cluster`. */
export const KEEP_CLUSTER = process.env.KM_E2E_KEEP_CLUSTER === '1';

const FIXTURES_PATH = resolve('tests/e2e/fixtures/seed.yaml');

let started: StartedK3sContainer | undefined;

function kubectl(containerId: string, args: string[], input?: string): void {
    execFileSync('docker', ['exec', '-i', containerId, 'kubectl', ...args], { encoding: 'utf8', input });
}

export async function ensureCluster(): Promise<void> {
    const container = new K3sContainer(K3S_IMAGE).withCommand([
        'server',
        '--disable=traefik',
        '--disable=servicelb',
        '--disable=metrics-server',
    ]);
    if (KEEP_CLUSTER) container.withName(CONTAINER_NAME).withReuse();
    started = await container.start();
    // Rename the generic "default" context, cluster and user so the UI shows an unmistakable name.
    writeFileSync(KUBECONFIG_PATH, started.getKubeConfig().replace(/\bdefault\b/g, CONTEXT_NAME));
    kubectl(started.getId(), ['apply', '-f', '-'], readFileSync(FIXTURES_PATH, 'utf8'));
    console.log(`[e2e] cluster ready, kubeconfig at ${KUBECONFIG_PATH}`);
}

export async function stopCluster(): Promise<void> {
    if (KEEP_CLUSTER) {
        console.log(
            `[e2e] KM_E2E_KEEP_CLUSTER=1: keeping ${CONTAINER_NAME}; remove with docker rm -f ${CONTAINER_NAME}`,
        );
        return;
    }
    await started?.stop();
}
