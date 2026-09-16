import { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon, HistoryIcon, TerminalIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { applyTerminalLook, useShellSessions, type ShellSession } from '@/lib/shell-sessions';
import { useTerminalFontSize } from '@/lib/settings';
import { readTerminalTheme } from '@/lib/terminal-look';
import { cn } from '@/lib/utils';

/**
 * The shell drawer: one place where every open session lives, at the bottom of the window rather
 * than inside a route. A terminal rendered in a route dies with it; these are attached and detached
 * as the drawer switches between them, so a shell survives going to look at something else and only
 * ends when it is closed or the cluster changes under it.
 */
export function ShellDrawer() {
    const sessions = useShellSessions();
    const [activeId, setActiveId] = useState<string | null>(null);
    const [collapsed, setCollapsed] = useState(false);
    const host = useRef<HTMLDivElement>(null);
    const fontSize = useTerminalFontSize();

    // The newest session is the fallback, so opening one brings it to the front and closing the
    // selected one hands the front to what is left, without storing a selection that can go stale.
    const active = sessions.find((session) => session.id === activeId) ?? sessions[sessions.length - 1] ?? null;

    // Attach the active session's own element rather than rendering a terminal: that is what keeps
    // the scrollback and the remote shell alive across every switch.
    useEffect(() => {
        const mount = host.current;
        if (!mount || !active || collapsed) return;
        mount.appendChild(active.element);
        const fit = () => active.fit.fit();
        const frame = requestAnimationFrame(fit);
        const observer = new ResizeObserver(fit);
        observer.observe(mount);
        return () => {
            cancelAnimationFrame(frame);
            observer.disconnect();
            active.element.remove();
        };
    }, [active, collapsed]);

    useEffect(() => {
        applyTerminalLook({ fontSize });
    }, [sessions, fontSize]);

    // Re-read the theme tokens when the app flips light or dark, without touching the sessions.
    useEffect(() => {
        const apply = () => applyTerminalLook({ theme: readTerminalTheme(document.documentElement) });
        apply();
        const observer = new MutationObserver(apply);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, [sessions]);

    if (sessions.length === 0) return null;

    return (
        <section
            className={cn('flex flex-col border-t border-border bg-code-bg', collapsed ? 'h-9' : 'h-72')}
            data-testid="shell-drawer"
            aria-label="Shells"
        >
            <div className="flex items-center gap-1 border-b border-border px-2 py-1">
                <TerminalIcon className="size-3.5 shrink-0 text-text-muted" />
                <div className="flex min-w-0 flex-1 gap-1 overflow-x-auto" role="tablist" aria-label="Open shells">
                    {sessions.map((session) => (
                        <SessionTab
                            key={session.id}
                            session={session}
                            active={session.id === active?.id}
                            onSelect={() => {
                                setActiveId(session.id);
                                setCollapsed(false);
                            }}
                        />
                    ))}
                </div>
                {active && <HistoryMenu session={active} />}
                <Button
                    variant="ghost"
                    size="xs"
                    aria-label={collapsed ? 'Expand shells' : 'Collapse shells'}
                    aria-expanded={!collapsed}
                    onClick={() => setCollapsed((v) => !v)}
                >
                    <ChevronDownIcon className={cn('transition-transform', collapsed && 'rotate-180')} />
                </Button>
            </div>
            {!collapsed && <div ref={host} className="min-h-0 flex-1 overflow-hidden p-2" data-testid="shell-host" />}
        </section>
    );
}

function SessionTab({ session, active, onSelect }: { session: ShellSession; active: boolean; onSelect: () => void }) {
    return (
        <div
            className={cn(
                'flex shrink-0 items-center gap-1 rounded-sm px-2 py-0.5 text-meta',
                active ? 'bg-elev-3 text-foreground' : 'text-text-muted',
            )}
        >
            <button type="button" role="tab" aria-selected={active} onClick={onSelect} className="max-w-48 truncate">
                {session.pod}
                <span className="ml-1 text-text-dim">{session.container}</span>
                {session.ended && <span className="ml-1 text-text-dim">(ended)</span>}
            </button>
            <button
                type="button"
                aria-label={`Close shell ${session.pod}`}
                className="text-text-dim hover:text-danger"
                onClick={() => session.close()}
            >
                <XIcon className="size-3" />
            </button>
        </div>
    );
}

/** Lines already sent in this session, for sending again without retyping them. */
function HistoryMenu({ session }: { session: ShellSession }) {
    const recent = [...new Set(session.history)].slice(-20).reverse();
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" aria-label="Command history" disabled={recent.length === 0}>
                    <HistoryIcon />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="max-w-96">
                {recent.map((command) => (
                    <DropdownMenuItem
                        key={command}
                        className="font-mono text-meta"
                        onSelect={() => session.send(`${command}\n`)}
                    >
                        {command}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
