import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// No test may ever see the developer's real kubeconfig. Point the default lookup at a file that
// does not exist inside a fresh temp directory: any code path that loads the default kubeconfig
// fails loudly instead of finding ~/.kube/config.
process.env.KUBECONFIG = join(mkdtempSync(join(tmpdir(), 'km-unit-')), 'nonexistent-kubeconfig');
