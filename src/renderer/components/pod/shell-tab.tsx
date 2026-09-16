import { useEffect, useRef } from 'react';
import { TerminalIcon } from 'lucide-react';
import type { PodDetail } from '../../../shared/k8s/pods';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { openShell, sessionId, useShellSessions } from '@/lib/shell-sessions';
import { useTerminalFontSize } from '@/lib/settings';
import { readTerminalLook } from '@/lib/terminal-look';

/**
 * The pod's Shell tab. The terminal itself lives in the drawer at the bottom of the window, not
 * here: a session opened from a page that unmounts when you look at anything else is not a session,
 * it is a demo. This tab opens one and says where it went.
 */
export function ShellTab({ name, namespace, pod }: { name: string; namespace: string; pod?: PodDetail | null }) {
    const containers = pod?.containers.map((c) => c.name) ?? [];
    const container = containers[0];
    const sessions = useShellSessions();
    const fontSize = useTerminalFontSize();
    const id = container ? sessionId({ namespace, pod: name, container }) : null;
    const open = !!id && sessions.some((session) => session.id === id);

    // The look is read when a shell is opened, so it must not be a reason to open one.
    const look = useRef(fontSize);
    useEffect(() => {
        look.current = fontSize;
    }, [fontSize]);

    /**
     * Opened once per pod and container. Not "whenever none is open": closing every shell is
     * exactly what a context switch does, and reopening one there would put a terminal back into a
     * cluster the user has just left.
     */
    const autoOpened = useRef<string | null>(null);
    useEffect(() => {
        if (!id || !container || autoOpened.current === id) return;
        autoOpened.current = id;
        openShell({ namespace, pod: name, container }, readTerminalLook(document.documentElement, look.current));
    }, [id, container, name, namespace]);

    return (
        <Card className="flex flex-col gap-2 rounded-card p-6 shadow-none" data-testid="shell-tab">
            <div className="flex items-center gap-2 text-body font-medium">
                <TerminalIcon className="size-4 text-primary" />
                {open ? 'Shell open below' : 'No container to open a shell into'}
            </div>
            <p className="text-cell text-text-muted">
                Shells run in the drawer at the bottom of the window, so they stay open while you look at other screens.
                Closing the drawer tab ends the session; switching cluster ends every session.
            </p>
            {container && (
                <div>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                            openShell(
                                { namespace, pod: name, container },
                                readTerminalLook(document.documentElement, fontSize),
                            )
                        }
                    >
                        <TerminalIcon />
                        {open ? 'Focus shell' : `Open shell into ${container}`}
                    </Button>
                </div>
            )}
        </Card>
    );
}
