import { useIpcQuery } from '@/lib/query';
import { ContextSelector } from './context-selector';

export function TopBar() {
    const namespace = useIpcQuery('namespace.active', {});
    return (
        <header className="flex h-14 items-center justify-between gap-4 border-b px-4" data-testid="top-bar">
            <ContextSelector />
            <div className="text-sm text-muted-foreground" data-testid="active-namespace">
                {namespace.data ? `${namespace.data.name} · ${namespace.data.pods} pods` : ''}
            </div>
        </header>
    );
}
