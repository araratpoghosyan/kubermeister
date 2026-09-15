import {
    MutationCache,
    QueryClient,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryKey,
    type UseQueryOptions,
} from '@tanstack/react-query';
import { toast } from 'sonner';
import type { IpcChannel, IpcInput, IpcOutput } from '../../shared/ipc';
import { invoke } from './ipc';
import { describeError } from './k8s-error';

export const queryClient = new QueryClient({
    /*
     * Every rejected write reports itself here, so a failed delete or scale can never pass
     * unnoticed and no hook needs its own error plumbing. Reads are not funnelled here: list and
     * detail screens render their own error states.
     */
    mutationCache: new MutationCache({
        onError: (error) => {
            const { title, detail } = describeError(error);
            toast.error(title, { description: detail });
        },
    }),
    defaultOptions: {
        queries: {
            retry: false,
            refetchOnWindowFocus: false,
            // Absorbs list-to-detail-and-back navigation without refetching; a context or namespace
            // switch re-keys queries so a stale scope is never served.
            staleTime: 5_000,
        },
    },
});

/** Query key for a channel and its input; the same shape everywhere so invalidation is by prefix. */
export function ipcQueryKey<C extends IpcChannel>(channel: C, input: IpcInput<C>): readonly [C, IpcInput<C>] {
    return [channel, input] as const;
}

/** A TanStack Query over one IPC channel, typed from the shared contract. */
export function useIpcQuery<C extends IpcChannel, TData = IpcOutput<C>>(
    channel: C,
    input: IpcInput<C>,
    options?: Omit<UseQueryOptions<IpcOutput<C>, Error, TData>, 'queryKey' | 'queryFn'>,
) {
    return useQuery<IpcOutput<C>, Error, TData>({
        queryKey: ipcQueryKey(channel, input),
        queryFn: () => invoke(channel, input),
        ...options,
    });
}

/** Drop every cluster-scoped query after a context or namespace switch. */
export async function invalidateClusterQueries(): Promise<void> {
    await queryClient.invalidateQueries({
        predicate: ({ queryKey }) => {
            const channel = String(queryKey[0]);
            return !channel.startsWith('app.') && !channel.startsWith('update.') && channel !== 'startupChecks';
        },
    });
}

export interface IpcMutationOptions<C extends IpcChannel> {
    /** Query keys to refetch once the write succeeds; name only the domains the write touches. */
    invalidates?: (input: IpcInput<C>, data: IpcOutput<C>) => QueryKey[];
}

/**
 * The hook every cluster write goes through. There is no optimistic update: the cluster is
 * authoritative and takes its time (a deleted object lingers while it terminates), so the write
 * awaits invalidation of the screens it affects and the caller drives its button state from
 * `isPending`. Blanket invalidation stays reserved for a context or namespace switch.
 */
export function useIpcMutation<C extends IpcChannel>(channel: C, options: IpcMutationOptions<C> = {}) {
    const client = useQueryClient();
    return useMutation<IpcOutput<C>, Error, IpcInput<C>>({
        mutationFn: (input) => invoke(channel, input),
        onSuccess: async (data, input) => {
            const keys = options.invalidates?.(input, data) ?? [];
            await Promise.all(keys.map((queryKey) => client.invalidateQueries({ queryKey })));
        },
    });
}
