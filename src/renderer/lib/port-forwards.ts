import { useSyncExternalStore } from 'react';
import type { ForwardKind, PodPortForwardInput, PortForwardStatus } from '../../shared/streams';
import { stream, type StreamHandle } from './ipc';

export type { ForwardKind };

/**
 * Every forward the app has open, held outside React for the same reason shells are: a forward that
 * lives in the page that started it dies the moment someone looks at something else, which is not
 * what anyone means by "forward this port". They end when stopped, or when the cluster changes.
 */

export interface ForwardTarget {
    kind: ForwardKind;
    name: string;
    namespace: string;
    targetPort: number;
    localPort: number;
}

export interface Forward extends ForwardTarget {
    id: string;
    /** Set once the local listener is up; the pod named is the one currently being forwarded to. */
    status: PortForwardStatus | null;
    error: string | null;
}

export const forwardId = (target: Pick<ForwardTarget, 'kind' | 'namespace' | 'name' | 'localPort'>): string =>
    `${target.kind}/${target.namespace}/${target.name}/${target.localPort}`;

/** The address a forward listens on, which is what people actually want from it. */
export const forwardUrl = (forward: Pick<Forward, 'localPort'>): string => `http://127.0.0.1:${forward.localPort}`;

interface Live {
    forward: Forward;
    handle: StreamHandle;
}

const live = new Map<string, Live>();
const listeners = new Set<() => void>();
let snapshot: Forward[] = [];

function publish(): void {
    snapshot = [...live.values()].map((one) => one.forward);
    for (const listener of listeners) listener();
}

function update(id: string, patch: Partial<Forward>): void {
    const entry = live.get(id);
    if (!entry) return;
    entry.forward = { ...entry.forward, ...patch };
    publish();
}

/**
 * Start forwarding, or hand back the forward already on that local port. Two forwards cannot share
 * a port, and the second one would fail at bind time with a message about an address in use rather
 * than about what the user actually did.
 */
export function startForward(target: ForwardTarget): Forward {
    const id = forwardId(target);
    const existing = live.get(id);
    if (existing) return existing.forward;

    const forward: Forward = { ...target, id, status: null, error: null };
    const input: PodPortForwardInput = {
        kind: target.kind,
        name: target.name,
        namespace: target.namespace,
        targetPort: target.targetPort,
        localPort: target.localPort,
    };
    const handle = stream('pods.portForward', input, (message) => {
        if (message.type === 'data') update(id, { status: message.data, error: null });
        else if (message.type === 'error') update(id, { error: message.message });
        else stopForward(id);
    });

    live.set(id, { forward, handle });
    publish();
    return forward;
}

export function stopForward(id: string): void {
    const entry = live.get(id);
    if (!entry) return;
    entry.handle.stop();
    live.delete(id);
    publish();
}

/** Stop every forward: what a context switch does, since each names a pod of the cluster being left. */
export function stopAllForwards(): void {
    for (const id of [...live.keys()]) stopForward(id);
}

export function subscribeForwards(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export function forwardSnapshot(): Forward[] {
    return snapshot;
}

/** The open forwards, as React state. */
export function useForwards(): Forward[] {
    return useSyncExternalStore(subscribeForwards, forwardSnapshot, forwardSnapshot);
}

/** One forward by its target, for a screen that wants to show the state of its own. */
export function useForward(
    target: Pick<ForwardTarget, 'kind' | 'namespace' | 'name' | 'localPort'> | null,
): Forward | null {
    const forwards = useForwards();
    if (!target) return null;
    const id = forwardId(target);
    return forwards.find((forward) => forward.id === id) ?? null;
}
