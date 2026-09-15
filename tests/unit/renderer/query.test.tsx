import { describe, expect, it } from 'vitest';
import { invalidateClusterQueries, ipcQueryKey, queryClient } from '../../../src/renderer/lib/query';

describe('query helpers', () => {
    it('builds keys as channel plus input so invalidation works by prefix', () => {
        expect(ipcQueryKey('nodes.get', { name: 'n1' })).toEqual(['nodes.get', { name: 'n1' }]);
    });

    it('invalidates cluster-scoped queries and leaves app-level ones alone', async () => {
        queryClient.setQueryData(['nodes.list', {}], []);
        queryClient.setQueryData(['contexts.list', {}], []);
        queryClient.setQueryData(['app.info', {}], {});
        queryClient.setQueryData(['update.state', {}], {});
        queryClient.setQueryData(['startupChecks', {}], {});
        await invalidateClusterQueries();
        const stale = (key: string) => queryClient.getQueryState([key, {}])?.isInvalidated ?? false;
        expect(stale('nodes.list')).toBe(true);
        expect(stale('contexts.list')).toBe(true);
        expect(stale('app.info')).toBe(false);
        expect(stale('update.state')).toBe(false);
        expect(stale('startupChecks')).toBe(false);
    });
});
