import { useState } from 'react';
import { RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { RestartKind } from '../../../shared/k8s/registry';
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
import { useRestartResource } from '@/lib/writes';

interface RestartButtonProps {
    kind: RestartKind;
    name: string;
    /** Tells same-named workloads apart across namespaces; every restartable kind is namespaced. */
    namespace: string;
}

/** How each kind replaces its pods, so the dialog promises what the cluster will actually do. */
const ROLLOUT_NOTE: Record<RestartKind, string> = {
    Deployment: 'Pods are replaced gradually, following the deployment’s update strategy.',
    StatefulSet: 'Pods are replaced one at a time, in reverse ordinal order.',
    DaemonSet: 'The pod on each node is replaced, following the daemon set’s update strategy.',
};

/**
 * The header's Restart action. Nothing is deleted here: the write stamps the pod template and the
 * controller rolls the pods itself, so the dialog explains the replacement before it starts and the
 * screens catch up through their own watches.
 */
export function RestartButton({ kind, name, namespace }: RestartButtonProps) {
    const [open, setOpen] = useState(false);
    const restart = useRestartResource();

    const confirm = async () => {
        const restarted = await restart.mutateAsync({ kind, name, namespace }).catch(() => null);
        setOpen(false);
        if (!restarted) return;
        toast.success(`${restarted.kind} “${restarted.name}” restarting`, { description: ROLLOUT_NOTE[kind] });
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <RefreshCwIcon />
                Restart
            </Button>
            {/* Dismissal is blocked while the write is in flight, so the dialog states the outcome. */}
            <AlertDialog open={open} onOpenChange={(next) => !next && !restart.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restart {kind}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Every pod of{' '}
                            <span className="font-medium text-foreground">
                                {kind} “{name}”
                            </span>{' '}
                            in namespace <span className="font-medium text-foreground">{namespace}</span> is replaced.{' '}
                            {ROLLOUT_NOTE[kind]}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={restart.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={restart.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the write settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {restart.isPending ? 'Restarting…' : 'Restart'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
