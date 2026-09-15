import { useState } from 'react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { usePodPortForward } from '@/lib/pod-streams';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** Distinct container ports a pod declares, in declaration order. */
export function declaredPorts(pod: PodDetail): number[] {
    const ports = pod.containers.flatMap((c) => c.ports).map((p) => Number.parseInt(p, 10));
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

export function PortForwardControl({ pod }: { pod: PodDetail }) {
    const targets = declaredPorts(pod);
    const [target, setTarget] = useState<number | null>(null);
    const [local, setLocal] = useState('');
    const [formError, setFormError] = useState<string | null>(null);
    const forward = usePodPortForward();
    const targetPort = target ?? targets[0];

    const start = () => {
        if (targetPort === undefined) return;
        const localPort = parseLocalPort(local, targetPort);
        if (localPort === null) {
            setFormError('Enter a local port between 1 and 65535.');
            return;
        }
        setFormError(null);
        forward.start({ name: pod.name, namespace: pod.namespace, targetPort, localPort });
    };

    if (targets.length === 0)
        return <p className="text-sm text-muted-foreground">This pod declares no container ports.</p>;

    const message =
        formError ??
        forward.error ??
        (forward.status ? `Listening on 127.0.0.1:${forward.status.localPort} → ${forward.status.targetPort}` : null);

    return (
        <div className="space-y-3" data-testid="port-forward">
            <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Target port</span>
                <Select
                    value={String(targetPort)}
                    onValueChange={(value) => setTarget(Number(value))}
                    disabled={forward.forwarding}
                >
                    <SelectTrigger className="h-8 w-28" aria-label="Target port">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {targets.map((port) => (
                            <SelectItem key={port} value={String(port)}>
                                {port}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="text-muted-foreground">Local port</span>
                <Input
                    value={local}
                    onChange={(event) => setLocal(event.target.value)}
                    placeholder={String(targetPort)}
                    disabled={forward.forwarding}
                    aria-label="Local port"
                    className="h-8 w-24"
                />
                {forward.forwarding ? (
                    <Button size="sm" variant="outline" onClick={forward.stop}>
                        Stop
                    </Button>
                ) : (
                    <Button size="sm" onClick={start}>
                        Start
                    </Button>
                )}
            </div>
            {message && (
                <p
                    className="font-mono text-xs"
                    data-testid="port-forward-status"
                    data-error={String(Boolean(formError ?? forward.error))}
                >
                    {message}
                </p>
            )}
        </div>
    );
}
