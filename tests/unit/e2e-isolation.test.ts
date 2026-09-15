import { describe, expect, it } from 'vitest';
import { isolationViolation } from '../e2e/harness/isolation';

const options = { testTree: '/repo/tests/e2e', kubeDir: '/home/u/.kube', contextName: 'km-e2e-ctx' };
const path = '/repo/tests/e2e/.kubeconfig';

const good = `apiVersion: v1
clusters:
  - cluster:
      server: https://127.0.0.1:55001
    name: km-e2e-ctx
contexts:
  - context:
      cluster: km-e2e-ctx
      user: km-e2e-ctx
    name: km-e2e-ctx
current-context: km-e2e-ctx
users:
  - name: km-e2e-ctx
    user:
      token: x
`;

describe('isolationViolation', () => {
    it('accepts the kubeconfig the harness writes', () => {
        expect(isolationViolation(path, good, options)).toBeNull();
        expect(isolationViolation(path, good.replace('127.0.0.1', 'localhost'), options)).toBeNull();
    });

    it('refuses a kubeconfig outside the test tree or inside ~/.kube', () => {
        expect(isolationViolation('/home/u/.kube/config', good, { ...options, testTree: '/home/u' })).toMatch(/inside/);
        expect(isolationViolation('/tmp/kubeconfig', good, options)).toMatch(/outside/);
    });

    it('refuses any current-context other than the test context', () => {
        expect(
            isolationViolation(path, good.replace('current-context: km-e2e-ctx', 'current-context: prod'), options),
        ).toMatch(/current-context is prod/);
        expect(isolationViolation(path, good.replace('current-context: km-e2e-ctx\n', ''), options)).toMatch(/unset/);
    });

    it('refuses a kubeconfig that names any other cluster, context or user', () => {
        const withProd = good.replace('users:', 'contexts-extra:\n  - name: prod-admin\nusers:');
        expect(isolationViolation(path, withProd, options)).toMatch(/prod-admin/);
    });

    it('refuses servers that are not loopback, missing, or malformed', () => {
        expect(
            isolationViolation(path, good.replace('https://127.0.0.1:55001', 'https://10.0.0.5:6443'), options),
        ).toMatch(/not a loopback/);
        expect(
            isolationViolation(path, good.replace('https://127.0.0.1:55001', 'https://prod.example.com'), options),
        ).toMatch(/not a loopback/);
        expect(isolationViolation(path, good.replace('      server: https://127.0.0.1:55001\n', ''), options)).toMatch(
            /no server/,
        );
        expect(isolationViolation(path, good.replace('https://127.0.0.1:55001', 'nonsense'), options)).toMatch(
            /not a valid URL/,
        );
    });
});
