import { useSyncExternalStore } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { openPodExec } from './pod-streams';
import type { TerminalLook } from './terminal-look';

/**
 * Open shells, kept outside React's tree on purpose. A terminal that lives in a route unmounts the
 * moment someone looks at something else, taking its scrollback and its session with it; these hold
 * their own element, so the drawer can attach one, detach it and attach it again without the remote
 * shell ever knowing. Ending a session is something the user does, not something navigation does.
 */

export interface ShellTarget {
    namespace: string;
    pod: string;
    container: string;
}

export interface ShellSession extends ShellTarget {
    id: string;
    /** The element the terminal is rendered into; the drawer moves it, never recreates it. */
    element: HTMLDivElement;
    terminal: Terminal;
    fit: FitAddon;
    /** Lines the user has sent, newest last, for recall. */
    history: string[];
    ended: boolean;
    send: (data: string) => void;
    close: () => void;
}

export const sessionId = (target: ShellTarget): string => `${target.namespace}/${target.pod}/${target.container}`;

const sessions = new Map<string, ShellSession>();
const listeners = new Set<() => void>();
/** A stable snapshot, replaced only when the set changes, so subscribers re-render exactly then. */
let snapshot: ShellSession[] = [];

function publish(): void {
    snapshot = [...sessions.values()];
    for (const listener of listeners) listener();
}

/** Everything the session tracks about what the user typed, updated as keystrokes go out. */
function recordInput(session: ShellSession, data: string, pending: { line: string }): void {
    for (const char of data) {
        if (char === '\r' || char === '\n') {
            const line = pending.line.trim();
            if (line) session.history.push(line);
            pending.line = '';
        } else if (char === '\x7f') {
            pending.line = pending.line.slice(0, -1);
        } else if (char >= ' ') {
            pending.line += char;
        }
    }
}

/**
 * Open a shell, or hand back the one already open for that container. Reusing it is the point: a
 * second Shell tab on the same pod should land in the session that is already there rather than
 * starting a competing one.
 */
export function openShell(target: ShellTarget, look: TerminalLook): ShellSession {
    const id = sessionId(target);
    const existing = sessions.get(id);
    if (existing) return existing;

    const element = document.createElement('div');
    element.className = 'h-full w-full';
    const terminal = new Terminal({
        fontFamily: look.fontFamily,
        fontSize: look.fontSize,
        cursorBlink: true,
        theme: look.theme,
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(element);

    const session: ShellSession = {
        ...target,
        id,
        element,
        terminal,
        fit,
        history: [],
        ended: false,
        send: () => {},
        close: () => {},
    };

    const control = openPodExec(
        { name: target.pod, namespace: target.namespace, container: target.container },
        {
            onData: (chunk) => terminal.write(chunk),
            onError: (message) => terminal.write(`\r\n\x1b[31m${message}\x1b[0m\r\n`),
            onEnd: () => {
                terminal.write('\r\n\x1b[90m[session ended]\x1b[0m\r\n');
                session.ended = true;
                publish();
            },
        },
    );

    const pending = { line: '' };
    const typed = terminal.onData((data) => {
        recordInput(session, data, pending);
        control.send(data);
    });

    session.send = (data) => {
        recordInput(session, data, pending);
        control.send(data);
    };
    session.close = () => {
        typed.dispose();
        control.stop();
        terminal.dispose();
        sessions.delete(id);
        publish();
    };

    sessions.set(id, session);
    publish();
    return session;
}

/**
 * Restyle every open terminal. The store owns them, so it is the store that changes them: a screen
 * handed a session must not reach into it, and the drawer only ever says what the look should be.
 */
export function applyTerminalLook(look: Partial<Pick<TerminalLook, 'fontSize' | 'theme'>>): void {
    for (const session of sessions.values()) {
        if (look.fontSize !== undefined) session.terminal.options.fontSize = look.fontSize;
        if (look.theme !== undefined) session.terminal.options.theme = look.theme;
    }
}

/** Close every shell: what a context switch does, since the pods belong to the cluster being left. */
export function closeAllShells(): void {
    for (const session of [...sessions.values()]) session.close();
}

export function subscribeShells(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function shellSnapshot(): ShellSession[] {
    return snapshot;
}

/** The open shells, as React state. */
export function useShellSessions(): ShellSession[] {
    return useSyncExternalStore(subscribeShells, shellSnapshot, shellSnapshot);
}
