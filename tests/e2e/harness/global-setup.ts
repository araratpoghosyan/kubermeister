import { ensureCluster } from './cluster';
import { assertIsolatedKubeconfig } from './isolation';

export default async function globalSetup(): Promise<void> {
    await ensureCluster();
    assertIsolatedKubeconfig();
}
