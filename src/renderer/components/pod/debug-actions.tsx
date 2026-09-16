import { useState } from 'react';
import { BugIcon, DownloadIcon, UploadIcon } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAddDebugContainer, useCopyFromPod, useCopyToPod } from '@/lib/writes';
import { openShell } from '@/lib/shell-sessions';
import { readTerminalLook } from '@/lib/terminal-look';
import { useTerminalFontSize } from '@/lib/settings';

interface PodDebugProps {
    name: string;
    namespace: string;
    /** The container the debugger joins and the copies address. */
    container?: string;
}

/**
 * Attach a debug container to a running pod, then open a shell into it. A pod built from a small
 * image has no shell to exec into, which is the case this exists for; the debugger brings its own.
 * It cannot be removed afterwards — the API has no call for that — so the dialog says so first.
 */
export function DebugContainerButton({ name, namespace, container }: PodDebugProps) {
    const [open, setOpen] = useState(false);
    const [image, setImage] = useState('');
    const debug = useAddDebugContainer();
    const fontSize = useTerminalFontSize();

    const confirm = async () => {
        const session = await debug
            .mutateAsync({
                name,
                namespace,
                targetContainer: container,
                ...(image.trim() ? { image: image.trim() } : {}),
            })
            .catch(() => null);
        setOpen(false);
        if (!session) return;
        openShell(
            { namespace: session.namespace, pod: session.pod, container: session.container },
            readTerminalLook(document.documentElement, fontSize),
        );
        toast.success(`Debug container “${session.container}” attached`, { description: 'Its shell is open below.' });
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <BugIcon />
                Debug
            </Button>
            <AlertDialog open={open} onOpenChange={(next) => !next && !debug.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Attach a debug container?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A container is added to <span className="font-medium text-foreground">{name}</span>
                            {container ? (
                                <>
                                    {' '}
                                    sharing <span className="font-mono">{container}</span>&apos;s process namespace
                                </>
                            ) : null}
                            , and its shell opens below. Kubernetes cannot remove an ephemeral container: it stays until
                            the pod does.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="debug-image">Image</Label>
                        <Input
                            id="debug-image"
                            value={image}
                            placeholder="busybox:1.36"
                            spellCheck={false}
                            disabled={debug.isPending}
                            onChange={(event) => setImage(event.target.value)}
                        />
                    </div>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={debug.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={debug.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the write settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {debug.isPending ? 'Attaching…' : 'Attach'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/**
 * Copying a file in or out. The path inside the container is asked for here; the local one is asked
 * for by the operating system, so the app never takes a local path from the screen.
 */
export function CopyFilesCard({ name, namespace, container }: PodDebugProps) {
    const [remotePath, setRemotePath] = useState('');
    const from = useCopyFromPod();
    const to = useCopyToPod();
    const busy = from.isPending || to.isPending;
    const path = remotePath.trim();

    const run = async (direction: 'from' | 'to') => {
        if (!path || !container) return;
        const mutation = direction === 'from' ? from : to;
        const done = await mutation.mutateAsync({ name, namespace, container, remotePath: path }).catch(() => null);
        // A cancelled picker answers null: nothing was copied, and nothing is claimed.
        if (!done) return;
        toast.success(
            direction === 'from' ? `Copied ${done.remotePath} out of ${name}` : `Copied into ${done.remotePath}`,
            { description: done.localPath },
        );
    };

    return (
        <div className="flex flex-col gap-2" data-testid="copy-files">
            <Label htmlFor="remote-path">Path in the container</Label>
            <Input
                id="remote-path"
                value={remotePath}
                placeholder="/etc/nginx/nginx.conf, or a directory to copy into"
                spellCheck={false}
                disabled={busy || !container}
                onChange={(event) => setRemotePath(event.target.value)}
            />
            <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={busy || !path} onClick={() => void run('from')}>
                    <DownloadIcon />
                    Copy out
                </Button>
                <Button variant="outline" size="sm" disabled={busy || !path} onClick={() => void run('to')}>
                    <UploadIcon />
                    Copy in
                </Button>
            </div>
            <p className="text-meta text-text-muted">
                Copying out saves a tar archive of the path; copying in places the file you choose inside the directory
                named above. Both use the container&apos;s own tools over exec.
            </p>
        </div>
    );
}
