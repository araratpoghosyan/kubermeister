import type { Kind } from '../../shared/k8s/registry';
import type { DetailOf } from '../../shared/k8s/resources';
import { useIpcQuery } from './query';
import { useRefreshIntervalMs } from './settings';

/** One object of a kind by name and namespace; `null` data means it does not exist. */
export function useResource<K extends Kind>(kind: K, name: string, namespace: string) {
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
