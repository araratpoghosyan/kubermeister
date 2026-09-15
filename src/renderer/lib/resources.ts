import type { Kind } from '../../shared/k8s/registry';
import type { DetailOf } from '../../shared/k8s/resources';
import type { RowOf } from '../../shared/k8s/resources';
import { useIpcQuery } from './query';
import { useRefreshIntervalMs } from './settings';

/**
 * Rows of a kind that has no watch source (the snapshot CRD), polled on the refresh interval.
 * Watched kinds use `useWatchedList` instead.
 */
export function usePolledList<K extends Kind>(kind: K, namespace?: string) {
    return useIpcQuery(
        'resources.list',
        { kind, namespace },
        { refetchInterval: useRefreshIntervalMs(), select: (output) => output.items as Array<RowOf<K>> },
    );
}

/** One object of a kind by name and namespace; `null` data means it does not exist. */
export function useResource<K extends Kind>(kind: K, name: string, namespace?: string) {
    const refetchInterval = useRefreshIntervalMs();
    return useIpcQuery(
        'resources.get',
        { kind, name, namespace },
        {
            refetchInterval,
            select: (output) => output.item as DetailOf<K> | null,
        },
    );
}
