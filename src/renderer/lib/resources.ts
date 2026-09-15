import type { Kind } from '../../shared/k8s/registry';
import type { DetailOf, RowOf } from '../../shared/k8s/resources';
import { useIpcQuery } from './query';

const LIVE_REFETCH_MS = 15_000;

/** Rows of one kind in a namespace (or the active one when omitted), typed from the output union. */
export function useResourceList<K extends Kind>(kind: K, namespace?: string) {
    return useIpcQuery(
        'resources.list',
        { kind, namespace },
        {
            refetchInterval: LIVE_REFETCH_MS,
            select: (output) => output.items as Array<RowOf<K>>,
        },
    );
}

/** One object of a kind by name and namespace; `null` data means it does not exist. */
export function useResource<K extends Kind>(kind: K, name: string, namespace: string) {
    return useIpcQuery(
        'resources.get',
        { kind, name, namespace },
        {
            refetchInterval: LIVE_REFETCH_MS,
            select: (output) => output.item as DetailOf<K> | null,
        },
    );
}
