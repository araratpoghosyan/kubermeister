import { useRouter } from '@tanstack/react-router';
import { useCallback } from 'react';
import { invoke } from './ipc';
import { listPathForSubPage } from './nav';
import { invalidateClusterQueries, queryClient, useIpcQuery } from './query';
import { closeAllShells } from './shell-sessions';

/**
 * Switch kube-context and forget everything read from the previous one. Open shells go with it:
 * main ends their streams anyway, and a terminal left behind names a pod of the cluster being left.
 */
export async function switchContext(name: string): Promise<void> {
    closeAllShells();
    await invoke('context.set', { name });
    await invalidateClusterQueries();
}

/**
 * Switch context from a screen. A detail page names an object of the cluster being left, so it
 * is closed first, back to its list: keeping it open would show the same-named object of the new
 * cluster under the old page's live tabs, and its streams are ended by main in any case.
 */
export function useSwitchContext(): (name: string) => Promise<void> {
    const router = useRouter();
    return useCallback(
        async (name: string) => {
            const listPath = listPathForSubPage(router.state.location.pathname);
            if (listPath) await router.navigate({ to: listPath });
            await switchContext(name);
        },
        [router],
    );
}

/** Scope namespaced reads to one namespace, or all with `null`, and refetch. */
export async function selectNamespace(namespace: string | null): Promise<void> {
    await invoke('namespace.set', { namespace });
    await queryClient.invalidateQueries({ queryKey: ['namespace.active'] });
    await invalidateClusterQueries();
}

/**
 * The active context and namespace, for anything that must reset when either changes. `namespace`
 * is undefined both while loading and under "All namespaces": it is a namespace name or nothing,
 * never a label, so it can be handed to a cluster call as it is.
 */
export function useScope(): { context: string | undefined; namespace: string | undefined; allNamespaces: boolean } {
    const context = useIpcQuery('context.current', {});
    const namespace = useIpcQuery('namespace.active', {});
    return {
        context: context.data?.name,
        namespace: namespace.data?.name ?? undefined,
        allNamespaces: namespace.data !== undefined && namespace.data?.name === null,
    };
}
