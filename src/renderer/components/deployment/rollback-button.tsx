import { useState } from 'react';
import { RotateCcwIcon } from 'lucide-react';
import { toast } from 'sonner';
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
import { useRollbackDeployment } from '@/lib/writes';

interface RollbackButtonProps {
    name: string;
    namespace: string;
    /** The revision to restore, as the history row shows it. */
    revision: string;
    /** That revision's image, so the dialog says what is coming back. */
    image: string;
}

/**
 * Roll back to one revision from the history table. The cluster rolls forward to the restored
 * template, so the result is a new revision rather than the old number returning — the dialog says
 * so, because a history that grows after a rollback surprises people otherwise.
 */
export function RollbackButton({ name, namespace, revision, image }: RollbackButtonProps) {
    const [open, setOpen] = useState(false);
    const rollback = useRollbackDeployment();

    const confirm = async () => {
        const done = await rollback.mutateAsync({ name, namespace, revision }).catch(() => null);
        setOpen(false);
        if (!done) return;
        if (done.skipped) {
            toast.success(`Revision #${done.revision} is already running`, { description: 'Nothing was changed.' });
            return;
        }
        toast.success(`Rolled “${done.name}” back to revision #${done.revision}`, {
            description: 'The cluster is rolling the pods onto the restored template.',
        });
    };

    return (
        <>
            <Button variant="ghost" size="xs" onClick={() => setOpen(true)}>
                <RotateCcwIcon />
                Roll back
            </Button>
            {/* Dismissal is blocked while the write is in flight, so the dialog states the outcome. */}
            <AlertDialog open={open} onOpenChange={(next) => !next && !rollback.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Roll back to revision #{revision}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            <span className="font-medium text-foreground">{name}</span> goes back to the pod template of
                            revision #{revision} (<span className="font-mono">{image}</span>) and its pods are replaced.
                            The cluster records this as a new revision rather than returning to the old number.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={rollback.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={rollback.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the write settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {rollback.isPending ? 'Rolling back…' : 'Roll back'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
