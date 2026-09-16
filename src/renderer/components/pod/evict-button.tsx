import { useState } from 'react';
import { LogOutIcon } from 'lucide-react';
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
import { useEvictPod } from '@/lib/writes';

/**
 * Evict rather than delete: the eviction API consults PodDisruptionBudgets, so a budget can refuse
 * this where a delete would simply take the pod. That refusal is the feature — it is what stops an
 * eviction taking the last healthy replica of something.
 */
export function EvictButton({ name, namespace }: { name: string; namespace: string }) {
    const [open, setOpen] = useState(false);
    const evict = useEvictPod();

    const confirm = async () => {
        const done = await evict.mutateAsync({ name, namespace }).catch(() => null);
        setOpen(false);
        if (!done) return;
        toast.success(`Pod “${done.name}” evicted`, {
            description: 'Whatever runs it decides whether it comes back.',
        });
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <LogOutIcon />
                Evict
            </Button>
            {/* Dismissal is blocked while the write is in flight, so the dialog states the outcome. */}
            <AlertDialog open={open} onOpenChange={(next) => !next && !evict.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Evict {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The pod is asked to go the way a node drain would ask, so a disruption budget may refuse it.
                            Whatever runs the pod decides whether a replacement appears.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={evict.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={evict.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the write settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {evict.isPending ? 'Evicting…' : 'Evict'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
