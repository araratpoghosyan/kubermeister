import { useId, useState } from 'react';
import { Trash2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { DANGEROUS_KINDS, type ManifestKind } from '../../../shared/k8s/manifest';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteResource } from '@/lib/writes';

interface DeleteResourceButtonProps {
    kind: ManifestKind;
    name: string;
    /** Tells same-named objects apart across namespaces; omitted for cluster-scoped kinds. */
    namespace?: string;
    /** The list to land on once the object is gone. */
    backTo: string;
}

/** What a delete of a far-reaching kind takes with it, said before the name is asked for. */
const CASCADE_NOTE: Partial<Record<ManifestKind, string>> = {
    Node: 'Every pod scheduled on it is lost.',
    CustomResourceDefinition: 'Every custom resource of this type in the cluster is deleted with it.',
    PersistentVolume: 'The data it backs may become unreachable.',
    StorageClass: 'Claims that name it can no longer be provisioned.',
    ClusterRole: 'Every binding that grants it stops granting anything.',
    ClusterRoleBinding: 'Its subjects lose the role everywhere in the cluster.',
};

/**
 * The header's Delete action: a confirmation naming exactly what will go, then the delete itself.
 * A kind whose deletion reaches beyond the object asks for its name to be typed first. On success
 * the page returns to its list, where the object may linger while the cluster finishes.
 */
export function DeleteResourceButton({ kind, name, namespace, backTo }: DeleteResourceButtonProps) {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState('');
    const navigateTo = useNavigateTo();
    const remove = useDeleteResource();
    const inputId = useId();

    const dangerous = DANGEROUS_KINDS.has(kind);
    const armed = !dangerous || typed.trim() === name;

    const setDialog = (next: boolean) => {
        setOpen(next);
        if (!next) setTyped('');
    };

    const confirm = async () => {
        if (!armed) return;
        const deleted = await remove.mutateAsync({ kind, name, namespace }).catch(() => null);
        setDialog(false);
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
                onClick={() => setDialog(true)}
            >
                <Trash2Icon />
            </Button>
            {/* Dismissal is blocked while the delete is in flight, so the dialog states the outcome. */}
            <AlertDialog open={open} onOpenChange={(next) => !next && !remove.isPending && setDialog(false)}>
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
                            {dangerous && CASCADE_NOTE[kind] ? ` ${CASCADE_NOTE[kind]}` : null}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {dangerous && (
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor={inputId}>
                                Type <span className="font-mono">{name}</span> to confirm
                            </Label>
                            <Input
                                id={inputId}
                                value={typed}
                                disabled={remove.isPending}
                                onChange={(event) => setTyped(event.target.value)}
                                autoComplete="off"
                                spellCheck={false}
                                autoFocus
                            />
                        </div>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={remove.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={remove.isPending || !armed}
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
