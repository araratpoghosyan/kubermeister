import { useState } from 'react';
import { PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
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
import { useRetryJob, useSuspendCronJob, useTriggerCronJob } from '@/lib/writes';

/**
 * Run a job again. A job's spec is immutable once it has run, so this deletes and resubmits it: the
 * dialog says so, because the old run's pods and logs go with it.
 */
export function RetryJobButton({ name, namespace }: { name: string; namespace: string }) {
    const [open, setOpen] = useState(false);
    const retry = useRetryJob();

    const confirm = async () => {
        const done = await retry.mutateAsync({ name, namespace }).catch(() => null);
        setOpen(false);
        if (!done) return;
        toast.success(`Job “${done.name}” started again`);
    };

    return (
        <>
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
                <RotateCcwIcon />
                Run again
            </Button>
            <AlertDialog open={open} onOpenChange={(next) => !next && !retry.isPending && setOpen(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Run {name} again?</AlertDialogTitle>
                        <AlertDialogDescription>
                            A job cannot be restarted in place, so this one is deleted and submitted again with the same
                            spec. The pods of the previous run go with it, and their logs with them.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={retry.isPending}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            disabled={retry.isPending}
                            onClick={(event) => {
                                // Keep the dialog open, with its buttons disabled, until the write settles.
                                event.preventDefault();
                                void confirm();
                            }}
                        >
                            {retry.isPending ? 'Starting…' : 'Run again'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}

/** Run a cron job now, off its schedule. The job it creates is owned by nobody and stays until deleted. */
export function TriggerCronJobButton({ name, namespace }: { name: string; namespace: string }) {
    const trigger = useTriggerCronJob();

    const submit = async () => {
        const done = await trigger.mutateAsync({ name, namespace }).catch(() => null);
        if (!done) return;
        toast.success(`Job “${done.name}” created`, { description: `Running ${name} off its schedule.` });
    };

    return (
        <Button variant="outline" size="sm" disabled={trigger.isPending} onClick={() => void submit()}>
            <PlayIcon />
            Run now
        </Button>
    );
}

/** Hold a cron job's schedule or let it run again; jobs already running are untouched either way. */
export function SuspendCronJobButton({
    name,
    namespace,
    suspended,
}: {
    name: string;
    namespace: string;
    suspended: boolean;
}) {
    const suspend = useSuspendCronJob();

    const submit = async () => {
        const next = !suspended;
        const done = await suspend.mutateAsync({ name, namespace, suspend: next }).catch(() => null);
        if (!done) return;
        toast.success(next ? `Schedule of “${name}” suspended` : `Schedule of “${name}” resumed`);
    };

    return (
        <Button variant="outline" size="sm" disabled={suspend.isPending} onClick={() => void submit()}>
            {suspended ? <PlayIcon /> : <PauseIcon />}
            {suspended ? 'Resume' : 'Suspend'}
        </Button>
    );
}
