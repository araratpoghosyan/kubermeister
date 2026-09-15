import { useId, useState } from 'react';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { toast } from 'sonner';
import type { Kind } from '../../../shared/k8s/registry';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Popover,
    PopoverContent,
    PopoverDescription,
    PopoverHeader,
    PopoverTitle,
    PopoverTrigger,
} from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useScaleResource } from '@/lib/writes';
import { cn } from '@/lib/utils';

/** Inert but focusable, so a control mid-write keeps keyboard focus instead of dropping it. */
const inertWhen = (off: boolean) => ({ 'aria-disabled': off, className: cn(off && 'pointer-events-none opacity-50') });

interface ScaleControlProps {
    kind: Kind;
    name: string;
    /** Tells same-named objects apart across namespaces. */
    namespace?: string;
    /** The current desired count: what a step adjusts by one and what the popover starts from. */
    replicas: number;
}

/**
 * Inline replica steppers for a list row. Each step writes an absolute target rather than a delta,
 * and both controls go inert while a write is in flight, so rapid clicks cannot race each other.
 * Clicking the count opens a field for an exact number.
 */
export function ScaleControl({ kind, name, namespace, replicas }: ScaleControlProps) {
    const scale = useScaleResource();
    const [open, setOpen] = useState(false);
    const [value, setValue] = useState('');
    const inputId = useId();

    const submit = (target: number, onDone?: () => void) => {
        if (target < 0 || !Number.isInteger(target) || target === replicas) return;
        scale.mutate(
            { kind, name, namespace, replicas: target },
            {
                onSuccess: () => {
                    toast.success(`Scaled ${kind} “${name}” to ${target}`);
                    onDone?.();
                },
            },
        );
    };

    const parsed = Number(value);
    const canSubmit = value.trim() !== '' && Number.isInteger(parsed) && parsed >= 0 && parsed !== replicas;

    return (
        <div className="flex items-center gap-1">
            <Button
                variant="outline"
                size="icon-xs"
                aria-label="Scale down"
                {...inertWhen(scale.isPending || replicas <= 0)}
                onClick={() => {
                    if (scale.isPending || replicas <= 0) return;
                    submit(replicas - 1);
                }}
            >
                <MinusIcon />
            </Button>

            <Popover
                open={open}
                onOpenChange={(next) => {
                    if (next) setValue(String(replicas));
                    setOpen(next);
                }}
            >
                <Tooltip>
                    <TooltipTrigger asChild>
                        <PopoverTrigger asChild>
                            <Button
                                variant="ghost"
                                size="xs"
                                className="min-w-6 font-mono tabular-nums"
                                aria-label={`Scale ${kind} “${name}”, currently ${replicas} replicas`}
                            >
                                {replicas}
                            </Button>
                        </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent>Set exact replicas</TooltipContent>
                </Tooltip>
                <PopoverContent align="center" className="w-60">
                    <PopoverHeader>
                        <PopoverTitle>Scale {kind}</PopoverTitle>
                        <PopoverDescription className="font-mono text-meta">
                            {name}
                            {namespace ? ` · ${namespace}` : ''}
                        </PopoverDescription>
                    </PopoverHeader>
                    <div className="mt-3 flex flex-col gap-1.5">
                        <Label htmlFor={inputId}>Replicas</Label>
                        <Input
                            id={inputId}
                            type="number"
                            min={0}
                            value={value}
                            disabled={scale.isPending}
                            onChange={(event) => setValue(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' && canSubmit) {
                                    event.preventDefault();
                                    submit(parsed, () => setOpen(false));
                                }
                            }}
                            autoFocus
                        />
                        <span className="text-meta text-text-dim">current: {replicas}</span>
                    </div>
                    <div className="mt-4 flex justify-end gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            {...inertWhen(scale.isPending)}
                            onClick={() => {
                                if (scale.isPending) return;
                                setOpen(false);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            size="sm"
                            {...inertWhen(!canSubmit || scale.isPending)}
                            onClick={() => {
                                if (!canSubmit || scale.isPending) return;
                                submit(parsed, () => setOpen(false));
                            }}
                        >
                            {scale.isPending ? 'Scaling…' : 'Scale'}
                        </Button>
                    </div>
                </PopoverContent>
            </Popover>

            <Button
                variant="outline"
                size="icon-xs"
                aria-label="Scale up"
                {...inertWhen(scale.isPending)}
                onClick={() => {
                    if (scale.isPending) return;
                    submit(replicas + 1);
                }}
            >
                <PlusIcon />
            </Button>
        </div>
    );
}
