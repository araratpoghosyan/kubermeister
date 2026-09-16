import { PauseIcon, PlayIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { usePauseDeployment } from '@/lib/writes';

interface PauseButtonProps {
    name: string;
    namespace: string;
    /** The rollout's current state, which decides whether this button holds it or lets it go. */
    paused: boolean;
}

/**
 * Pause and resume in one control. Neither direction asks for confirmation: pausing changes nothing
 * that is already running, and resuming only lets the controller do what it was going to do anyway.
 */
export function PauseButton({ name, namespace, paused }: PauseButtonProps) {
    const pause = usePauseDeployment();

    const submit = async () => {
        const next = !paused;
        const done = await pause.mutateAsync({ name, namespace, paused: next }).catch(() => null);
        if (!done) return;
        toast.success(
            next ? `Rollout of “${name}” paused` : `Rollout of “${name}” resumed`,
            next ? { description: 'The controller applies no further change until it is resumed.' } : undefined,
        );
    };

    return (
        <Button variant="outline" size="sm" disabled={pause.isPending} onClick={() => void submit()}>
            {paused ? <PlayIcon /> : <PauseIcon />}
            {paused ? 'Resume' : 'Pause'}
        </Button>
    );
}
