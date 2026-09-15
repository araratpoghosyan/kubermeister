import { QueryClient, useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { IpcChannel, IpcInput, IpcOutput } from '../../shared/ipc';
import { invoke } from './ipc';

export const queryClient = new QueryClient({
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
