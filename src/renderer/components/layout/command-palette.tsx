import { useEffect } from 'react';
import { PlusIcon } from 'lucide-react';
import {
    CommandDialog,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from '@/components/ui/command';
import { ALL_DOMAINS } from '@/lib/nav';
import { useIpcQuery } from '@/lib/query';
import { selectNamespace, useSwitchContext } from '@/lib/scope';
import { useNavigateTo } from './nav-link';

interface CommandPaletteProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}

/** ⌘K / Ctrl+K quick actions: switch context or namespace, jump to any screen. */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
    const navigateTo = useNavigateTo();
    const switchContext = useSwitchContext();
    const contexts = useIpcQuery('contexts.list', {}).data ?? [];
    const namespaces = useIpcQuery('namespaces.list', {}).data ?? [];

    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            // Match on the physical key so Caps Lock and non-Latin layouts still trigger.
            if (e.code === 'KeyK' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onOpenChange(!open);
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [open, onOpenChange]);

    const close = () => onOpenChange(false);
    const go = (path: string) => {
        close();
        navigateTo(path);
    };

    return (
        <CommandDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Quick actions"
            description="Switch cluster, namespace or resource"
            className="max-w-xl"
        >
            <CommandInput placeholder="Switch cluster, namespace or resource…" />
            <CommandList>
                <CommandEmpty>No results found.</CommandEmpty>

                <CommandGroup heading="Contexts">
                    {contexts.map((ctx) => (
                        <CommandItem
                            key={ctx.name}
                            value={`cluster ${ctx.name}`}
                            onSelect={() => {
                                close();
                                void switchContext(ctx.name);
                            }}
                        >
                            <span className="flex-1">{ctx.name}</span>
                            <span className="text-label text-text-muted">{ctx.cluster}</span>
                        </CommandItem>
                    ))}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="Namespaces">
                    {namespaces.map((ns) => (
                        <CommandItem
                            key={ns.name}
                            value={`namespace ${ns.name}`}
                            onSelect={() => {
                                close();
                                void selectNamespace(ns.name);
                            }}
                        >
                            <span className="flex-1">{ns.name}</span>
                            <span className="font-mono text-label text-text-muted">{ns.pods} pods</span>
                        </CommandItem>
                    ))}
                </CommandGroup>

                <CommandSeparator />

                <CommandGroup heading="Actions">
                    <CommandItem value="create resource" onSelect={() => go('/create')}>
                        <PlusIcon className="size-3.5 text-text-muted" />
                        <span className="flex-1">Create resource</span>
                    </CommandItem>
                </CommandGroup>

                <CommandSeparator />

                {ALL_DOMAINS.map((domain) => (
                    <CommandGroup key={domain.id} heading={domain.label}>
                        {domain.groups.flatMap((group) =>
                            group.items.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <CommandItem
                                        key={item.path}
                                        value={`${domain.label} ${item.label}`}
                                        onSelect={() => go(item.path)}
                                    >
                                        <Icon className="size-3.5 text-text-muted" />
                                        <span>{item.label}</span>
                                    </CommandItem>
                                );
                            }),
                        )}
                    </CommandGroup>
                ))}
            </CommandList>
        </CommandDialog>
    );
}
