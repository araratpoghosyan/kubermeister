import { useEffect, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { StartupCheck, StartupReport } from '../../shared/ipc';
import { invoke } from '@/lib/ipc';
import { describeError } from '@/lib/k8s-error';
import { ipcQueryKey, useIpcQuery } from '@/lib/query';
import { Preloader } from './preloader';
import { StartupError } from './startup-error';

/** Whether the probe reached the cluster, which is when priming its namespaces is worth waiting for. */
function clusterReachable(report: StartupReport): boolean {
    return report.checks.some((check) => check.id === 'cluster' && check.status === 'ok');
}

/**
 * Load the namespace list into the query cache before the shell renders, so the selector and the
 * palette open populated instead of every screen racing the cluster for it. Waits only when the
 * startup probe reached the cluster, and only once: a failed read still lets the app in, and a
 * later context switch resets the query without bringing the preloader back.
 */
function useNamespacePrime(report: StartupReport | undefined): boolean {
    const queryClient = useQueryClient();
    const wanted = report?.ok === true && clusterReachable(report);
    const [primed, setPrimed] = useState(false);
    useEffect(() => {
        if (!wanted || primed) return;
        let cancelled = false;
        void queryClient
            .prefetchQuery({
                queryKey: ipcQueryKey('namespaces.list', {}),
                queryFn: () => invoke('namespaces.list', {}),
            })
            .finally(() => {
                if (!cancelled) setPrimed(true);
            });
        return () => {
            cancelled = true;
        };
    }, [wanted, primed, queryClient]);
    return !wanted || primed;
}

/**
 * Boots the app behind the startup checks: preloader while they run, an actionable error screen
 * while any check is an error, the app once they pass and its namespaces are primed. The result is
 * kept forever and only the buttons re-trigger it, so a later transient failure cannot unmount a
 * running app.
 */
export function StartupGate({ children }: { children: ReactNode }) {
    const { data, isPending, isError, error, isFetching, refetch } = useIpcQuery(
        'startupChecks',
        {},
        { staleTime: Infinity, gcTime: Infinity },
    );
    const retry = () => void refetch();
    const namespacesReady = useNamespacePrime(data);

    if (isPending) return <Preloader />;

    if (isError && !data) {
        const described = describeError(error);
        const fallback: StartupCheck[] = [
            { id: 'kubeconfig', label: 'Startup checks', status: 'error', detail: described.detail },
        ];
        return <StartupError checks={fallback} onRetry={retry} retrying={isFetching} />;
    }

    if (!data.ok) {
        const pick = async () => {
            const { path } = await invoke('kubeconfig.pick', {});
            if (path) await refetch();
        };
        const reset = async () => {
            await invoke('kubeconfig.useDefault', {});
            await refetch();
        };
        return (
            <StartupError
                checks={data.checks}
                onRetry={retry}
                retrying={isFetching}
                onPickKubeconfig={() => void pick()}
                onResetKubeconfig={() => void reset()}
            />
        );
    }

    if (!namespacesReady) return <Preloader />;

    return <>{children}</>;
}
