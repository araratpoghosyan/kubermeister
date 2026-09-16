import { BanIcon, CircleCheckIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useCordonNode } from '@/lib/writes';

/**
 * Cordon and uncordon in one control. Nothing running moves either way — cordoning only stops the
 * scheduler placing new pods here — so neither direction asks for confirmation.
 */
export function CordonButton({ name, cordoned }: { name: string; cordoned: boolean }) {
    const cordon = useCordonNode();

    const submit = async () => {
        const unschedulable = !cordoned;
        const done = await cordon.mutateAsync({ name, unschedulable }).catch(() => null);
        if (!done) return;
        toast.success(
            unschedulable ? `Node “${name}” cordoned` : `Node “${name}” uncordoned`,
            unschedulable ? { description: 'Running pods stay; no new ones are scheduled here.' } : undefined,
        );
    };

    return (
        <Button variant="outline" size="sm" disabled={cordon.isPending} onClick={() => void submit()}>
            {cordoned ? <CircleCheckIcon /> : <BanIcon />}
            {cordoned ? 'Uncordon' : 'Cordon'}
        </Button>
    );
}
