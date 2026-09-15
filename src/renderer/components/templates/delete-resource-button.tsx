import { useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import type { ManifestKind } from '../../../shared/k8s/manifest';
import { useNavigateTo } from '@/components/layout/nav-link';
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
import { useDeleteResource } from '@/lib/writes';

interface DeleteResourceButtonProps {
    kind: ManifestKind;
    name: string;
    /** Tells same-named objects apart across namespaces; omitted for cluster-scoped kinds. */
    namespace?: string;
    /** The list to land on once the object is gone. */
    backTo: string;
}

/**
 * The header's Delete action: a confirmation naming exactly what will go, then the delete itself.
 * On success the page returns to its list, where the object may linger while the cluster finishes.
 */
export function DeleteResourceButton({ kind, name, namespace, backTo }: DeleteResourceButtonProps) {
    const [open, setOpen] = useState(false);
    const navigateTo = useNavigateTo();
    const remove = useDeleteResource();

    const confirm = async () => {
        const deleted = await remove.mutateAsync({ kind, name, namespace }).catch(() => null);
        setOpen(false);
        if (!deleted) return;
        toast.success(`${deleted.kind} “${deleted.name}” deleted`);
        navigateTo(backTo);
    };

    return (
        <>
            <Button
                variant="ghost"
                size="icon-sm"
                className="text-danger"
                aria-label="Delete"
                onClick={() => setOpen(true)}
            >
                <Trash2Icon />
            </Button>
            {/* Dismissal is blocked while the delete is in flight, so the dialog states the outcome. */}
            <AlertDialog open={open} onOpenChange={(next) => !next && !remove.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {kind}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete{' '}
                            <span className="font-medium text-foreground">
                                {kind} “{name}”
                            </span>
                            {namespace ? (
                                <>
                                    {' '}
                                    from namespace <span className="font-medium text-foreground">{namespace}</span>
                                </>
                            ) : null}
                            ? This cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={remove.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the delete settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {remove.isPending ? 'Deleting…' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
