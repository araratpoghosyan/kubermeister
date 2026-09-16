import { useState } from 'react';
import { BookmarkIcon, TrashIcon } from 'lucide-react';
import { toast } from 'sonner';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import { updateSettings, useSettings } from '@/lib/settings';

/**
 * Saved views: the filter somebody keeps coming back to, under a name. A view is user data rather
 * than window state, so it lives in the settings file with the remembered forwards, and it is
 * scoped to the screen that made it — "failing pods" means nothing on the storage classes list.
 */
export function ViewsMenu({
    screen,
    selector,
    onApply,
}: {
    screen: string;
    selector: string;
    onApply: (selector: string) => void;
}) {
    const settings = useSettings();
    // Settings actions take the client explicitly, so a test with its own sees the cache write.
    const client = useQueryClient();
    const save = (patch: Parameters<typeof updateSettings>[1]) => updateSettings(client, patch);
    const [name, setName] = useState('');
    const [open, setOpen] = useState(false);
    const views = (settings.data?.data.savedViews ?? []).filter((view) => view.screen === screen);

    const add = async () => {
        const trimmed = name.trim();
        if (!trimmed || !selector) return;
        const rest = (settings.data?.data.savedViews ?? []).filter(
            (view) => !(view.screen === screen && view.name === trimmed),
        );
        await save({ data: { savedViews: [...rest, { screen, name: trimmed, labelSelector: selector }] } });
        setName('');
        // Saving is the end of the errand, and an open menu covers the list it filters.
        setOpen(false);
        toast.success(`View “${trimmed}” saved`);
    };

    const remove = async (viewName: string) => {
        const rest = (settings.data?.data.savedViews ?? []).filter(
            (view) => !(view.screen === screen && view.name === viewName),
        );
        await save({ data: { savedViews: rest } });
    };

    return (
        <DropdownMenu open={open} onOpenChange={setOpen}>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" data-testid="views-menu">
                    <BookmarkIcon />
                    Views
                    {views.length > 0 && <span className="tabular-nums">{views.length}</span>}
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                {views.length === 0 && <div className="px-2 py-1.5 text-meta text-text-muted">No saved views yet.</div>}
                {views.map((view) => (
                    <DropdownMenuItem
                        key={view.name}
                        data-view={view.name}
                        onSelect={() => onApply(view.labelSelector)}
                        className="justify-between"
                    >
                        <span className="truncate">{view.name}</span>
                        <Button
                            variant="ghost"
                            size="icon-xs"
                            aria-label={`Delete view ${view.name}`}
                            onClick={(event) => {
                                event.stopPropagation();
                                void remove(view.name);
                            }}
                        >
                            <TrashIcon />
                        </Button>
                    </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <div className="flex items-center gap-1.5 p-1.5">
                    <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder="Name this filter"
                        aria-label="View name"
                        className="h-7 text-meta"
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') void add();
                        }}
                    />
                    <Button size="xs" disabled={!selector || !name.trim()} onClick={() => void add()}>
                        Save
                    </Button>
                </div>
                {!selector && (
                    <div className="px-2 pb-1.5 text-meta text-text-muted">Set a label filter to save a view.</div>
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
