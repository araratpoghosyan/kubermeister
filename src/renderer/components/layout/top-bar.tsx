import { useIpcQuery } from '@/lib/query';
import { ContextSelector } from './context-selector';
import { NamespaceSelector } from './namespace-selector';

export function TopBar() {
    const namespace = useIpcQuery('namespace.active', {});
    return (
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4" data-testid="top-bar">
            <div className="flex items-center gap-2">
                <ContextSelector />
                <NamespaceSelector />
            </div>
            <div className="text-sm text-muted-foreground" data-testid="active-namespace">
                {namespace.data ? `${namespace.data.name} · ${namespace.data.pods} pods` : ''}
            </div>
        </header>
    );
}
