import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import type { PodDetail } from '../../../shared/k8s/pods';
import { openPodExec } from '@/lib/pod-streams';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/** xterm needs literal colors; this palette matches the dark theme tokens. */
const THEME = {
    background: '#0b0e14',
    foreground: '#c9d1d9',
    cursor: '#4d7cff',
    black: '#2e3440',
    red: '#e06c75',
    green: '#98c379',
    yellow: '#e5c07b',
    blue: '#61afef',
    magenta: '#c678dd',
    cyan: '#56b6c2',
    white: '#d0d0d0',
    brightBlack: '#4b5263',
    brightRed: '#ff7b86',
    brightGreen: '#b5e0a0',
    brightYellow: '#ffd9a0',
    brightBlue: '#82c0ff',
    brightMagenta: '#e0a0f0',
    brightCyan: '#7fd0da',
    brightWhite: '#ffffff',
};

/**
 * One interactive shell per selected container. The session opens when the terminal mounts and
 * closes when it unmounts or the container changes, so there is never more than one websocket.
 */
export function PodShellTab({ pod }: { pod: PodDetail }) {
    const host = useRef<HTMLDivElement>(null);
    const containers = pod.containers.map((c) => c.name);
    const [selected, setSelected] = useState<string | null>(null);
    const container = selected && containers.includes(selected) ? selected : containers[0];

    useEffect(() => {
        const element = host.current;
        if (!element || !container) return;
        const term = new Terminal({
            fontFamily: 'JetBrains Mono Variable, monospace',
            fontSize: 12,
            cursorBlink: true,
            theme: THEME,
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(element);
        const frame = requestAnimationFrame(() => fit.fit());

        const session = openPodExec(
            { name: pod.name, namespace: pod.namespace, container },
            {
                onData: (chunk) => term.write(chunk),
                onError: (message) => term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`),
                onEnd: () => term.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n'),
            },
        );
        const keys = term.onData((data) => session.send(data));
        const observer = new ResizeObserver(() => fit.fit());
        observer.observe(element);

        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            keys.dispose();
            session.stop();
            term.dispose();
        };
    }, [pod.name, pod.namespace, container]);

    if (!container) return <p className="text-sm text-muted-foreground">This pod has no containers.</p>;
    return (
        <div className="flex h-[60vh] min-h-0 flex-col overflow-hidden rounded-md border" data-testid="pod-shell">
            <div className="flex items-center gap-2 border-b px-3 py-2 text-xs">
                <Select value={container} onValueChange={setSelected} disabled={containers.length < 2}>
                    <SelectTrigger className="h-8 w-44" aria-label="Container">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {containers.map((name) => (
                            <SelectItem key={name} value={name}>
                                {name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
                <span className="font-mono text-muted-foreground">/bin/sh</span>
            </div>
            <div ref={host} className="min-h-0 flex-1 bg-[#0b0e14] p-2" data-testid="terminal-host" />
        </div>
    );
}
