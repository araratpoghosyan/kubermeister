import { useCallback, useEffect, useRef, useState } from 'react';
import type { LogLine } from '../../shared/k8s/logs';
import type { PodExecInput, PodLogsInput, PodPortForwardInput, PortForwardStatus } from '../../shared/streams';
import { stream, type StreamHandle } from './ipc';

/** Lines kept per log view; a chatty container must not grow memory without bound. */
export const LOG_LINE_CAP = 2_000;

/** Append lines and trim from the front so the buffer never exceeds the cap. */
export function appendCapped<T>(current: T[], incoming: T[], cap = LOG_LINE_CAP): T[] {
    const merged =
        current.length + incoming.length > cap ? [...current, ...incoming].slice(-cap) : [...current, ...incoming];
    return merged;
}

export interface LogStreamState {
    lines: LogLine[];
    /** True while the follow is open and no error has arrived. */
    live: boolean;
    error: string | null;
    ended: boolean;
}

/**
 * Follow a container's logs. Lines are batched per animation frame so a burst of output causes one
 * render, and capped so the buffer stays bounded. Restarts whenever the target or window changes.
 */
const EMPTY: LogStreamState = { lines: [], live: false, error: null, ended: false };

export function usePodLogStream(input: PodLogsInput | null): LogStreamState {
    const key = input ? JSON.stringify(input) : null;
    const [state, setState] = useState<LogStreamState>(EMPTY);
    // Reset during render when the target changes, so the old target's lines never show under the
    // new one; effects run after paint, which would flash them.
    const [trackedKey, setTrackedKey] = useState(key);
    if (trackedKey !== key) {
        setTrackedKey(key);
        setState(EMPTY);
    }

    useEffect(() => {
        if (!key) return;
        const parsed = JSON.parse(key) as PodLogsInput;
        let pending: LogLine[] = [];
        let frame: number | undefined;
        const flush = () => {
            frame = undefined;
            const batch = pending;
            pending = [];
            setState((s) => ({ ...s, lines: appendCapped(s.lines, batch), live: true }));
        };
        const handle = stream('pods.logs', parsed, (message) => {
            if (message.type === 'data') {
                pending.push(message.data);
                frame ??= requestAnimationFrame(flush);
            } else if (message.type === 'error') {
                setState((s) => ({ ...s, live: false, error: message.message }));
            } else {
                setState((s) => ({ ...s, live: false, ended: true }));
            }
        });
        return () => {
            if (frame !== undefined) cancelAnimationFrame(frame);
            handle.stop();
        };
    }, [key]);

    return state;
}

export interface ExecCallbacks {
    onData: (chunk: string) => void;
    onError: (message: string) => void;
    onEnd: () => void;
}

/** Open an exec session; the caller wires a terminal to it and stops it on unmount. */
export function openPodExec(input: PodExecInput, callbacks: ExecCallbacks): StreamHandle {
    return stream('pods.exec', input, (message) => {
        if (message.type === 'data') callbacks.onData(message.data);
        else if (message.type === 'error') callbacks.onError(message.message);
        else callbacks.onEnd();
    });
}

export interface PortForwardState {
    forwarding: boolean;
    status: PortForwardStatus | null;
    error: string | null;
    start: (input: PodPortForwardInput) => void;
    stop: () => void;
}

/** One port-forward at a time per control; stopping tears the loopback server down. */
export function usePodPortForward(): PortForwardState {
    const handle = useRef<StreamHandle | null>(null);
    const [forwarding, setForwarding] = useState(false);
    const [status, setStatus] = useState<PortForwardStatus | null>(null);
    const [error, setError] = useState<string | null>(null);

    const stop = useCallback(() => {
        handle.current?.stop();
        handle.current = null;
        setForwarding(false);
        setStatus(null);
    }, []);

    const start = useCallback(
        (input: PodPortForwardInput) => {
            stop();
            setError(null);
            setForwarding(true);
            handle.current = stream('pods.portForward', input, (message) => {
                if (message.type === 'data') setStatus(message.data);
                else if (message.type === 'error') setError(message.message);
                else stop();
            });
        },
        [stop],
    );

    useEffect(() => () => handle.current?.stop(), []);

    return { forwarding, status, error, start, stop };
}
