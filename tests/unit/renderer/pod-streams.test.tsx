import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LogLine } from '../../../src/shared/k8s/logs';
import type { StreamMessage } from '../../../src/shared/streams';

type Handler = (message: StreamMessage<unknown>) => void;
const handles: Array<{
    stop: ReturnType<typeof vi.fn>;
    send: ReturnType<typeof vi.fn>;
    handler: Handler;
    channel: string;
    input: unknown;
}> = [];
const stream = vi.fn((channel: string, input: unknown, handler: Handler) => {
    const handle = { stop: vi.fn(), send: vi.fn(), handler, channel, input };
    handles.push(handle);
    return handle;
});
vi.mock('@/lib/ipc', async () => ({ ...(await vi.importActual<typeof import('@/lib/ipc')>('@/lib/ipc')), stream }));

const { appendCapped, LOG_LINE_CAP, openPodExec, usePodLogStream, usePodPortForward } =
    await import('@/lib/pod-streams');

const line = (message: string): LogLine => ({ level: 'INFO', timestamp: '', message });
const last = () => handles[handles.length - 1]!;
/** Queued animation-frame callbacks; a real browser runs them after the current task, never inline. */
const frames: FrameRequestCallback[] = [];
const paint = () => {
    const batch = frames.splice(0, frames.length);
    for (const cb of batch) cb(0);
};

describe('appendCapped', () => {
    it('keeps the newest lines when the cap is exceeded', () => {
        expect(appendCapped([1, 2], [3], 5)).toEqual([1, 2, 3]);
        expect(appendCapped([1, 2, 3], [4, 5, 6], 4)).toEqual([3, 4, 5, 6]);
        expect(
            appendCapped(
                [],
                Array.from({ length: LOG_LINE_CAP + 10 }, (_, i) => i),
            ),
        ).toHaveLength(LOG_LINE_CAP);
    });
});

describe('usePodLogStream', () => {
    beforeEach(() => {
        handles.length = 0;
        stream.mockClear();
        frames.length = 0;
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
        vi.stubGlobal('cancelAnimationFrame', () => {});
    });

    it('does nothing without a target and opens one stream per target', () => {
        const { result, rerender } = renderHook(
            (input: Parameters<typeof usePodLogStream>[0]) => usePodLogStream(input),
            { initialProps: null },
        );
        expect(stream).not.toHaveBeenCalled();
        expect(result.current).toEqual({ lines: [], live: false, error: null, ended: false });
        rerender({ name: 'web-1', namespace: 'team-a', container: 'web' });
        expect(stream).toHaveBeenCalledWith(
            'pods.logs',
            { name: 'web-1', namespace: 'team-a', container: 'web' },
            expect.any(Function),
        );
        rerender({ name: 'web-1', namespace: 'team-a', container: 'web' });
        expect(stream).toHaveBeenCalledTimes(1);
        rerender({ name: 'web-1', namespace: 'team-a', container: 'sidecar' });
        expect(stream).toHaveBeenCalledTimes(2);
        expect(handles[0]!.stop).toHaveBeenCalledOnce();
    });

    it('collects lines, marks live, and reports errors and the end', () => {
        const { result } = renderHook(() => usePodLogStream({ name: 'web-1', namespace: 'team-a', container: 'web' }));
        act(() => {
            last().handler({ type: 'data', data: line('one') });
            last().handler({ type: 'data', data: line('two') });
            paint();
        });
        expect(result.current.lines.map((l) => l.message)).toEqual(['one', 'two']);
        expect(result.current.live).toBe(true);
        act(() => last().handler({ type: 'error', message: 'gone' }));
        expect(result.current).toMatchObject({ live: false, error: 'gone' });
        act(() => last().handler({ type: 'end' }));
        expect(result.current.ended).toBe(true);
    });

    it('caps the buffer', () => {
        const { result } = renderHook(() => usePodLogStream({ name: 'web-1', namespace: 'team-a', container: 'web' }));
        act(() => {
            for (let i = 0; i < LOG_LINE_CAP + 5; i += 1) last().handler({ type: 'data', data: line(String(i)) });
            paint();
        });
        expect(result.current.lines).toHaveLength(LOG_LINE_CAP);
        expect(result.current.lines[0]?.message).toBe('5');
    });

    it('stops the stream on unmount', () => {
        const { unmount } = renderHook(() => usePodLogStream({ name: 'web-1', namespace: 'team-a', container: 'web' }));
        unmount();
        expect(last().stop).toHaveBeenCalledOnce();
    });
});

describe('openPodExec', () => {
    it('routes output, errors and the end to the callbacks and exposes send and stop', () => {
        handles.length = 0;
        const callbacks = { onData: vi.fn(), onError: vi.fn(), onEnd: vi.fn() };
        const session = openPodExec({ name: 'web-1', namespace: 'team-a', container: 'web' }, callbacks);
        expect(last().channel).toBe('pods.exec');
        last().handler({ type: 'data', data: '$ ' });
        last().handler({ type: 'error', message: 'boom' });
        last().handler({ type: 'end' });
        expect(callbacks.onData).toHaveBeenCalledWith('$ ');
        expect(callbacks.onError).toHaveBeenCalledWith('boom');
        expect(callbacks.onEnd).toHaveBeenCalledOnce();
        session.send('ls\n');
        expect(last().send).toHaveBeenCalledWith('ls\n');
        session.stop();
        expect(last().stop).toHaveBeenCalledOnce();
    });
});

describe('usePodPortForward', () => {
    beforeEach(() => {
        handles.length = 0;
    });

    it('starts, reports listening, reports errors, and stops', () => {
        const { result } = renderHook(() => usePodPortForward());
        expect(result.current.forwarding).toBe(false);
        act(() => result.current.start({ name: 'web-1', namespace: 'team-a', targetPort: 8080, localPort: 9090 }));
        expect(result.current.forwarding).toBe(true);
        expect(last().channel).toBe('pods.portForward');
        act(() => last().handler({ type: 'data', data: { status: 'listening', localPort: 9090, targetPort: 8080 } }));
        expect(result.current.status).toEqual({ status: 'listening', localPort: 9090, targetPort: 8080 });
        act(() => last().handler({ type: 'error', message: 'EADDRINUSE' }));
        expect(result.current.error).toBe('EADDRINUSE');
        act(() => result.current.stop());
        expect(last().stop).toHaveBeenCalledOnce();
        expect(result.current).toMatchObject({ forwarding: false, status: null });
    });

    it('replaces a running forward when started again and ends when main ends it', () => {
        const { result, unmount } = renderHook(() => usePodPortForward());
        act(() => result.current.start({ name: 'web-1', namespace: 'team-a', targetPort: 80, localPort: 8080 }));
        const first = last();
        act(() => result.current.start({ name: 'web-1', namespace: 'team-a', targetPort: 80, localPort: 8081 }));
        expect(first.stop).toHaveBeenCalledOnce();
        act(() => last().handler({ type: 'end' }));
        expect(result.current.forwarding).toBe(false);
        unmount();
    });
});
