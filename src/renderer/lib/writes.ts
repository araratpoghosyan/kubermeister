import type { ManifestKind } from '../../shared/k8s/manifest';
import type { Kind } from '../../shared/k8s/registry';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mapWithConcurrency, type BulkDeleteResult, type BulkDeleteTarget } from './bulk-delete';
import { invoke } from './ipc';
import { describeError } from './k8s-error';
import { useIpcMutation } from './query';

/**
 * Which queries a write invalidates: the kind's own list and reads, plus the object's events. Keys
 * are matched by prefix, so naming the channel is enough to catch every input shape of it.
 */
function resourceKeys(kind: ManifestKind, name: string, namespace?: string) {
    return [
        ['resources.list'],
        ['resources.get'],
        ['resources.getYaml', { kind, name, namespace }],
        ['events.forObject'],
        ['metrics.alerts'],
    ];
}

export function useCreateResource() {
    return useIpcMutation('resources.create', { invalidates: () => [['resources.list'], ['metrics.alerts']] });
}

export function useReplaceResource() {
    return useIpcMutation('resources.replace', {
        invalidates: (_input, data) => resourceKeys(data.kind as ManifestKind, data.name, data.namespace),
    });
}

export function useDeleteResource() {
    return useIpcMutation('resources.delete', {
        invalidates: (input) => resourceKeys(input.kind, input.name, input.namespace),
    });
}

export function useScaleResource() {
    return useIpcMutation('resources.scale', {
        invalidates: (input) => resourceKeys(input.kind as Kind, input.name, input.namespace),
    });
}

/** How many deletes run at once: enough to be quick, few enough not to flood the API server. */
const BULK_DELETE_CONCURRENCY = 4;

/**
 * Delete several objects of one kind. Each is deleted on its own and a failure does not stop the
 * rest, so the caller can report exactly what went and what did not.
 */
export function useBulkDeleteResources() {
    const client = useQueryClient();
    return useMutation<BulkDeleteResult, Error, { kind: ManifestKind; targets: BulkDeleteTarget[] }>({
        mutationFn: async ({ kind, targets }) => {
            const settled = await mapWithConcurrency(targets, BULK_DELETE_CONCURRENCY, async (target) => {
                try {
                    await invoke('resources.delete', { kind, name: target.name, namespace: target.namespace });
                    return { target, message: null };
                } catch (error) {
                    return { target, message: describeError(error).detail };
                }
            });
            return {
                deleted: settled.filter((one) => one.message === null).map((one) => one.target),
                failed: settled
                    .filter((one): one is { target: BulkDeleteTarget; message: string } => one.message !== null)
                    .map((one) => ({ ...one.target, message: one.message })),
            };
        },
        onSuccess: async () => {
            await Promise.all(
                [['resources.list'], ['resources.get'], ['metrics.alerts']].map((queryKey) =>
                    client.invalidateQueries({ queryKey }),
                ),
            );
        },
    });
}
