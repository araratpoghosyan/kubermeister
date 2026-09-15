import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/ipc';
import { invalidateClusterQueries, useIpcQuery } from '@/lib/query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Switch the kube-context the app reads from; every cluster query re-fetches afterwards. */
export function ContextSelector() {
    const queryClient = useQueryClient();
    const contexts = useIpcQuery('contexts.list', {});
    const current = contexts.data?.find((context) => context.current);

    const onChange = async (name: string) => {
        if (!name || name === current?.name) return;
        await invoke('context.set', { name });
        await queryClient.invalidateQueries({ queryKey: ['contexts.list'] });
        await invalidateClusterQueries();
    };

    return (
        <Select value={current?.name ?? ''} onValueChange={(name) => void onChange(name)} disabled={!contexts.data}>
            <SelectTrigger className="w-64" aria-label="Kubernetes context" data-testid="context-selector">
                <SelectValue placeholder="No context" />
            </SelectTrigger>
            <SelectContent>
                {(contexts.data ?? []).map((context) => (
                    <SelectItem key={context.name} value={context.name}>
                        {context.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
