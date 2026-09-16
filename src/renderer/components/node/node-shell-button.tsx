import { useState } from 'react';
import { TerminalIcon } from 'lucide-react';
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
import { useIpcQuery } from '@/lib/query';
import { openShell } from '@/lib/shell-sessions';
import { useTerminalFontSize } from '@/lib/settings';
import { readTerminalLook } from '@/lib/terminal-look';
import { useStartNodeShell } from '@/lib/writes';

/**
 * A shell on the node itself, by running a privileged pod there that enters the host's namespaces.
 * This is the most powerful thing the app can do, so it is spelled out before it happens and the
 * pod it leaves behind is named in the toast: it is an ordinary pod and deleting it is the user's.
 */
export function NodeShellButton({ name }: { name: string }) {
    const [open, setOpen] = useState(false);
    const start = useStartNodeShell();
    const fontSize = useTerminalFontSize();
    // The pod lands in the namespace the app is scoped to; with none selected there is nowhere
    // obvious to put it, and guessing at kube-system would be the app choosing for the user.
    const namespace = useIpcQuery('namespace.active', {}).data?.name ?? null;

    const confirm = async () => {
        if (!namespace) return;
        const session = await start.mutateAsync({ name, namespace }).catch(() => null);
        setOpen(false);
        if (!session) return;
        openShell(
            { namespace: session.namespace, pod: session.pod, container: session.container },
            readTerminalLook(document.documentElement, fontSize),
        );
        toast.success(`Node shell running as “${session.pod}”`, {
            description: 'Delete that pod when you are done with it.',
        });
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <TerminalIcon />
                Node shell
            </Button>
            <AlertDialog open={open} onOpenChange={(next) => !next && !start.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Open a shell on {name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This runs a privileged pod on the node that enters the host&apos;s process, mount and
                            network namespaces. Whoever uses that shell is root on the machine. The pod stays until it
                            is deleted, and it will appear in your pod lists.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    {!namespace && (
                        <p className="text-cell text-danger">
                            Select a namespace first: the pod has to be created somewhere, and the app will not choose
                            that for you.
                        </p>
                    )}
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={start.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            disabled={start.isPending || !namespace}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the write settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {start.isPending ? 'Starting…' : 'Open shell'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
