import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, type Settings } from '../../../src/shared/settings';

const settings: Settings = {
    ...DEFAULT_SETTINGS,
    connection: { kubeconfigPath: resolve('tests/unit/fixtures/kubeconfig.yaml') },
};
const updateSettings = vi.fn();
vi.mock('../../../src/main/settings/store.js', () => ({ getSettings: () => settings, updateSettings }));

async function load() {
    vi.resetModules();
    const client = await import('../../../src/main/k8s/client.js');
    const context = await import('../../../src/main/k8s/context.js');
    return { ...client, ...context };
}

describe('contexts', () => {
    beforeEach(() => {
        updateSettings.mockReset();
    });

    it('lists every context with its cluster, user, namespace and current flag', async () => {
        const { listContexts } = await load();
        expect(listContexts()).toEqual([
            { name: 'alpha', cluster: 'alpha-cluster', user: 'alpha-user', namespace: 'team-a', current: true },
            { name: 'beta', cluster: 'beta-cluster', user: 'beta-user', namespace: undefined, current: false },
        ]);
    });

    it('reports the current context', async () => {
        const { getCurrentContext } = await load();
        expect(getCurrentContext()?.name).toBe('alpha');
    });

    it('switches context in memory, resets the namespace, rebuilds clients and remembers the choice', async () => {
        const { setContext, getCurrentContext, getActiveNamespace, apis, listContexts } = await load();
        const before = apis();
        const switched = setContext('beta');
        expect(switched).toEqual({
            name: 'beta',
            cluster: 'beta-cluster',
            user: 'beta-user',
            namespace: undefined,
            current: true,
        });
        expect(getCurrentContext()?.name).toBe('beta');
        expect(getActiveNamespace()).toBeNull();
        expect(apis()).not.toBe(before);
        expect(listContexts().map((c) => c.current)).toEqual([false, true]);
        expect(updateSettings).toHaveBeenCalledWith({ session: { lastContext: 'beta', lastNamespace: null } });
    });

    it('rejects an unknown context without changing anything', async () => {
        const { setContext, getCurrentContext } = await load();
        expect(() => setContext('nope')).toThrow('Unknown context: nope');
        expect(getCurrentContext()?.name).toBe('alpha');
        expect(updateSettings).not.toHaveBeenCalled();
    });

    it('sets and remembers the namespace, including clearing it', async () => {
        const { setNamespace, getActiveNamespace } = await load();
        expect(setNamespace('kube-system')).toEqual({ namespace: 'kube-system' });
        expect(getActiveNamespace()).toBe('kube-system');
        expect(updateSettings).toHaveBeenCalledWith({ session: { lastNamespace: 'kube-system' } });
        expect(setNamespace(null)).toEqual({ namespace: null });
    });
});
