import { useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { usePodPortForward } from '@/lib/pod-streams';

/** Distinct container ports a pod declares, in declaration order. */
export function declaredPorts(pod?: PodDetail | null): number[] {
    const ports = (pod?.containers ?? []).flatMap((c) => c.ports).map((p) => Number.parseInt(p, 10));
    return [...new Set(ports.filter((n) => Number.isInteger(n) && n > 0))];
}

/** A local port, or null when the text is not a valid TCP port. Empty means "same as target". */
export function parseLocalPort(text: string, fallback: number): number | null {
    const trimmed = text.trim();
    if (trimmed === '') return fallback;
    if (!/^\d+$/.test(trimmed)) return null;
    const port = Number(trimmed);
    return port >= 1 && port <= 65535 ? port : null;
}

/** Local port-forward control for the pod-detail Network tab. */
export function PortForwardControl({
    name,
    namespace,
    pod,
}: {
    name: string;
    namespace: string;
    pod?: PodDetail | null;
}) {
    const targetPorts = declaredPorts(pod);
    const [targetPort, setTargetPort] = useState<number | null>(null);
    const [localPort, setLocalPort] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const forward = usePodPortForward();
    const target = targetPort ?? targetPorts[0];

    const start = () => {
        if (target === undefined) return;
        // Validate the local port instead of silently falling back to the target on garbage input.
        const local = parseLocalPort(localPort, target);
        if (local === null) {
            setFormError('error: enter a valid local port (1–65535)');
            return;
        }
        setFormError(null);
        forward.start({ name, namespace, targetPort: target, localPort: local });
    };

    const status =
        formError ??
        (forward.error ? `error: ${forward.error}` : null) ??
        (forward.status ? `Listening on 127.0.0.1:${forward.status.localPort} → ${forward.status.targetPort}` : null);

    return (
        <div className="border-t border-border p-4" data-testid="port-forward">
            <div className="mb-2 text-body font-semibold">Port forward</div>
            {targetPorts.length === 0 ? (
                <div className="text-meta text-text-muted">This pod declares no container ports.</div>
            ) : (
                <div className="flex items-center gap-2 text-cell">
                    <span className="text-text-muted">Target</span>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="xs" disabled={forward.forwarding} aria-label="Target port">
                                {target}
                                <ChevronDownIcon />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {targetPorts.map((p) => (
                                <DropdownMenuItem key={p} onSelect={() => setTargetPort(p)}>
                                    {p}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                    <span className="ml-1 text-text-muted">Local</span>
                    <Input
                        value={localPort}
                        onChange={(e) => setLocalPort(e.target.value)}
                        placeholder={String(target ?? '')}
                        disabled={forward.forwarding}
                        aria-label="Local port"
                        className="h-7 w-20 text-cell"
                    />
                    {forward.forwarding ? (
                        <Button variant="outline" size="xs" onClick={forward.stop}>
                            Stop
                        </Button>
                    ) : (
                        <Button size="xs" onClick={start}>
                            Start
                        </Button>
                    )}
                </div>
            )}
            {status && (
                <div
                    className="mt-2 font-mono text-label text-text-2"
                    data-testid="port-forward-status"
                    data-error={String(Boolean(formError ?? forward.error))}
                >
                    {status}
                </div>
            )}
        </div>
    );
}
