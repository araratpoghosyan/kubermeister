import { useState } from 'react';
import type { Table } from '@tanstack/react-table';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { ManifestKind } from '../../../shared/k8s/manifest';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { bulkDeleteSummary, failedSelection, type BulkDeleteTarget } from '@/lib/bulk-delete';
import { useBulkDeleteResources } from '@/lib/writes';

/** How many names the confirmation lists before summarizing the rest. */
const SHOWN_NAMES = 8;

interface BulkDeleteBarProps<T> {
    table: Table<T>;
    kind: ManifestKind;
    /** The plural the page title uses, for the count copy. */
    noun: string;
}

/**
 * The selection bar above a list: invisible until rows are checked, then it says how many and
 * offers to delete exactly those. The confirmation names them. Objects are deleted one by one, the
 * outcome is a single summary, and whatever failed stays selected so a retry starts from there.
 * Targets come from the table's own selection, so a search that hides rows also excludes them.
 */
export function BulkDeleteBar<T>({ table, kind, noun }: BulkDeleteBarProps<T>) {
    const [open, setOpen] = useState(false);
    const bulk = useBulkDeleteResources();

    const targets: BulkDeleteTarget[] = table.getSelectedRowModel().rows.map((row) => {
        const original = row.original as { name: string; namespace?: string };
        return { name: original.name, namespace: original.namespace };
    });
    if (targets.length === 0) return null;

    const spansNamespaces = new Set(targets.map((target) => target.namespace ?? '')).size > 1;
    const nameOf = (target: BulkDeleteTarget) =>
        spansNamespaces && target.namespace ? `${target.namespace}/${target.name}` : target.name;
    const shown = targets.slice(0, SHOWN_NAMES);
    const hidden = targets.length - shown.length;

    const confirm = async () => {
        const result = await bulk.mutateAsync({ kind, targets }).catch(() => null);
        setOpen(false);
        if (!result) return;
        table.setRowSelection(failedSelection(result.failed));
        const summary = bulkDeleteSummary(result, kind, noun);
        if (summary.ok) toast.success(summary.message);
        else toast.error(summary.message, { description: summary.detail });
    };

    return (
        <div className="flex items-center gap-1.5" data-testid="bulk-delete-bar">
            <span className="text-cell text-text-muted">
                <span className="font-mono text-foreground tabular-nums">{targets.length}</span> selected
            </span>
            <Button variant="ghost" size="sm" onClick={() => table.resetRowSelection()}>
                Clear
            </Button>
            <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
                <Trash2Icon />
                Delete {targets.length}
            </Button>
            {/* Dismissal is blocked while the batch is in flight, so the dialog states the outcome. */}
            <AlertDialog open={open} onOpenChange={(next) => !next && !bulk.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>
                            Delete {targets.length} {targets.length === 1 ? kind : noun}?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This permanently deletes{' '}
                            <span className="font-medium text-foreground">
                                {shown.map(nameOf).join(', ')}
                                {hidden > 0 ? ` and ${hidden} more` : ''}
                            </span>
                            . This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={bulk.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={bulk.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the batch settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {bulk.isPending ? 'Deleting…' : `Delete ${targets.length}`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
