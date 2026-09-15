import { useQueryClient } from '@tanstack/react-query';
import { invoke } from '@/lib/ipc';
import { invalidateClusterQueries, useIpcQuery } from '@/lib/query';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const ALL = '__all__';

/** Scope every namespaced list to one namespace, or to all of them. */
export function NamespaceSelector() {
    const queryClient = useQueryClient();
    const namespaces = useIpcQuery('namespaces.list', {});
    const active = useIpcQuery('namespace.active', {});
    const value = active.data ? (active.data.name === 'All Namespaces' ? ALL : active.data.name) : '';

    const onChange = async (next: string) => {
        if (!next || next === value) return;
        await invoke('namespace.set', { namespace: next === ALL ? null : next });
        await queryClient.invalidateQueries({ queryKey: ['namespace.active'] });
        await invalidateClusterQueries();
    };

    return (
        <Select value={value} onValueChange={(next) => void onChange(next)} disabled={!namespaces.data || !active.data}>
            <SelectTrigger className="w-56" aria-label="Namespace" data-testid="namespace-selector">
                <SelectValue placeholder="Namespace" />
            </SelectTrigger>
            <SelectContent>
                <SelectItem value={ALL}>All Namespaces</SelectItem>
                {(namespaces.data ?? []).map((ns) => (
                    <SelectItem key={ns.name} value={ns.name}>
                        {ns.name}
                    </SelectItem>
                ))}
            </SelectContent>
        </Select>
    );
}
