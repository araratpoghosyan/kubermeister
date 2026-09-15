import { invoke } from './ipc';
import { invalidateClusterQueries, queryClient } from './query';

/** Switch kube-context and refetch everything cluster-scoped. */
export async function switchContext(name: string): Promise<void> {
    await invoke('context.set', { name });
    await queryClient.invalidateQueries({ queryKey: ['contexts.list'] });
    await invalidateClusterQueries();
}

/** Scope namespaced reads to one namespace, or all with `null`, and refetch. */
export async function selectNamespace(namespace: string | null): Promise<void> {
    await invoke('namespace.set', { namespace });
    await queryClient.invalidateQueries({ queryKey: ['namespace.active'] });
    await invalidateClusterQueries();
}
