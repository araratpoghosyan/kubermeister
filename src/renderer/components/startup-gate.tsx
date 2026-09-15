import type { ReactNode } from 'react';
import type { StartupCheck } from '../../shared/ipc';
import { invoke } from '@/lib/ipc';
import { describeError } from '@/lib/k8s-error';
import { useIpcQuery } from '@/lib/query';
import { Preloader } from './preloader';
import { StartupError } from './startup-error';

/**
 * Boots the app behind the startup checks: preloader while they run, an actionable error screen
 * while any check is an error, the app once they pass. The result is kept forever and only the
 * buttons re-trigger it, so a later transient failure cannot unmount a running app.
 */
export function StartupGate({ children }: { children: ReactNode }) {
    const { data, isPending, isError, error, isFetching, refetch } = useIpcQuery(
        'startupChecks',
        {},
        { staleTime: Infinity, gcTime: Infinity },
    );
    const retry = () => void refetch();

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

    return <>{children}</>;
}
