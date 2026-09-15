import { useEffect, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { ChevronDownIcon, TerminalIcon } from 'lucide-react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { openPodExec } from '@/lib/pod-streams';

/**
 * ANSI 16-color palettes for the exec terminal. xterm needs literal colors (it cannot read Tailwind
 * classes), and remote program output (`ls --color`, coloured prompts) is tuned per background:
 * bright colors that pop on dark wash out on light, so each theme ships a matched palette.
 * Background, foreground and cursor still come from the app's CSS tokens.
 */
export const DARK_ANSI = {
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
} as const;
export const LIGHT_ANSI = {
    black: '#24292e',
    red: '#c0392b',
    green: '#1a7f4b',
    yellow: '#9a6700',
    blue: '#3d5bd6',
    magenta: '#8250df',
    cyan: '#0e7490',
    white: '#6b6b72',
    brightBlack: '#57606a',
    brightRed: '#a40e26',
    brightGreen: '#116329',
    brightYellow: '#7d4e00',
    brightBlue: '#2a45b0',
    brightMagenta: '#6639ba',
    brightCyan: '#0b5d6e',
    brightWhite: '#111318',
} as const;

/** The terminal theme for the current app theme: token colors plus the matched ANSI palette. */
export function readTerminalTheme(host: Element) {
    const styles = getComputedStyle(host);
    const light = document.documentElement.classList.contains('light');
    return {
        background: styles.getPropertyValue('--code-bg').trim() || '#0b0e14',
        foreground: styles.getPropertyValue('--text-2').trim() || '#c9d1d9',
        cursor: styles.getPropertyValue('--primary').trim() || '#4d7cff',
        ...(light ? LIGHT_ANSI : DARK_ANSI),
    };
}

/** Interactive exec terminal (xterm.js) for the pod-detail Shell tab. */
export function ShellTab({ name, namespace, pod }: { name: string; namespace: string; pod?: PodDetail | null }) {
    const ref = useRef<HTMLDivElement>(null);
    const containers = pod?.containers.map((c) => c.name) ?? [];
    const [selectedContainer, setSelectedContainer] = useState<string | null>(null);
    const container = selectedContainer && containers.includes(selectedContainer) ? selectedContainer : containers[0];

    useEffect(() => {
        const host = ref.current;
        // Wait until the pod (and thus a container) has resolved before opening the exec, so exactly one
        // session opens against the right container instead of one against a default first.
        if (!host || !container) return;
        const styles = getComputedStyle(document.documentElement);
        const term = new Terminal({
            fontFamily: styles.getPropertyValue('--font-mono').trim() || 'monospace',
            fontSize: 12,
            cursorBlink: true,
            theme: readTerminalTheme(host),
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(host);
        // Fit after layout settles so xterm sizes to the real container height.
        const raf = requestAnimationFrame(() => fit.fit());

        const control = openPodExec(
            { name, namespace, container },
            {
                onData: (chunk) => term.write(chunk),
                onError: (message) => term.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`),
                onEnd: () => term.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n'),
            },
        );
        const onData = term.onData((data) => control.send(data));
        // Re-fit when the panel resizes (tab layout, window), not just on window resize.
        const resizeObserver = new ResizeObserver(() => fit.fit());
        resizeObserver.observe(host);
        // Re-read theme vars when the app theme class flips, without recreating the session.
        const themeObserver = new MutationObserver(() => {
            term.options.theme = readTerminalTheme(host);
        });
        themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

        return () => {
            cancelAnimationFrame(raf);
            resizeObserver.disconnect();
            themeObserver.disconnect();
            onData.dispose();
            control.stop();
            term.dispose();
        };
    }, [name, namespace, container]);

    return (
        <Card className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-card bg-code-bg py-0 shadow-none">
            <div className="flex items-center gap-2 border-b border-border px-3.5 py-2">
                <TerminalIcon className="size-3.5 text-text-muted" />
                <span className="text-meta text-text-2">{name}</span>
                {containers.length > 0 && (
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="xs" disabled={containers.length < 2} aria-label="Container">
                                {container ?? '—'}
                                <ChevronDownIcon />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                            {containers.map((c) => (
                                <DropdownMenuItem key={c} onSelect={() => setSelectedContainer(c)}>
                                    {c}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                )}
                <span className="text-meta text-text-muted">/bin/sh</span>
            </div>
            <div ref={ref} className="min-h-0 flex-1 overflow-hidden p-2" data-testid="terminal-host" />
        </Card>
    );
}
