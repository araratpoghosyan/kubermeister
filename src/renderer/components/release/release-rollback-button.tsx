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
import { useRollbackRelease } from '@/lib/writes';

interface ReleaseRollbackButtonProps {
    name: string;
    namespace: string;
    /** The revision to restore, as the history row shows it. */
    revision: number;
    /** That revision's chart, so the dialog says what is coming back. */
    chart: string;
}

/**
 * Roll a release back to one of its own revisions. Helm numbers forward through a rollback rather
 * than rewinding, so the dialog says the result will be a new revision: a history that grows after
 * a rollback is surprising otherwise.
 */
export function ReleaseRollbackButton({ name, namespace, revision, chart }: ReleaseRollbackButtonProps) {
    const [open, setOpen] = useState(false);
    const rollback = useRollbackRelease();

    const confirm = async () => {
        const done = await rollback.mutateAsync({ name, namespace, revision }).catch(() => null);
        setOpen(false);
        if (!done) return;
        toast.success(`Rolled “${done.name}” back to revision ${revision}`, {
            description: `Now revision ${done.revision}${done.kept > 0 ? `; ${done.kept} object(s) kept by the chart` : ''}.`,
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
                        <AlertDialogTitle>Roll back to revision {revision}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The objects revision {revision} of{' '}
                            <span className="font-medium text-foreground">{chart}</span> rendered are applied again,
                            and anything it never had is removed. Helm records this as a new revision rather than
                            returning to the old number.
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
