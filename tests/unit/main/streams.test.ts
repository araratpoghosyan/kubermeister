import { EventEmitter } from 'node:events';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { StreamController, StreamSend } from '../../../src/shared/streams';

type IpcListener = (event: { sender: FakeSender }, arg: unknown) => Promise<unknown> | unknown;
const listeners = new Map<string, IpcListener>();
vi.mock('electron', () => ({
    ipcMain: { handle: (channel: string, listener: IpcListener) => listeners.set(channel, listener) },
}));

let handler = vi.fn<(input: unknown, send: StreamSend) => Promise<StreamController>>();
vi.mock('../../../src/main/k8s/watch.js', () => ({
    startResourceWatch: (input: unknown, send: StreamSend) => handler(input, send),
}));

const { registerStreamHandlers, activeStreamCount, stopAllStreams, endAllStreams } =
    await import('../../../src/main/ipc/streams.js');

class FakeSender extends EventEmitter {
    constructor(public readonly id: number) {
        super();
    }
    destroyed = false;
    send = vi.fn();
    isDestroyed = () => this.destroyed;
}

const call = (channel: string, sender: FakeSender, arg: unknown) => listeners.get(channel)!({ sender }, arg);
const start = (sender: FakeSender, subId = 'stream:resources.watch:1', input: unknown = { kind: 'Pod' }) =>
    call('stream.start', sender, { channel: 'resources.watch', subId, input });

function controller(): StreamController & { stop: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> } {
    return { stop: vi.fn(), write: vi.fn() };
}

describe('stream registry', () => {
    beforeEach(() => {
        listeners.clear();
        handler = vi.fn();
        registerStreamHandlers();
    });

    it('starts a stream, delivers its messages to the sender, and stops it on request', async () => {
        const sender = new FakeSender(1);
        const ctl = controller();
        handler.mockImplementation(async (_input, send) => {
            send({ type: 'data', data: 'hello' });
            return ctl;
        });
        await start(sender);
        expect(handler).toHaveBeenCalledWith({ kind: 'Pod' }, expect.any(Function));
        expect(sender.send).toHaveBeenCalledWith('sub.stream:resources.watch:1', { type: 'data', data: 'hello' });
        expect(activeStreamCount()).toBe(1);
        await call('stream.stop', sender, { subId: 'stream:resources.watch:1' });
        expect(ctl.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
    });

    it('forwards stream.send only to a stream owned by the same window', async () => {
        const owner = new FakeSender(1);
        const other = new FakeSender(2);
        const ctl = controller();
        handler.mockResolvedValue(ctl);
        await start(owner);
        await call('stream.send', other, { subId: 'stream:resources.watch:1', data: 'x' });
        expect(ctl.write).not.toHaveBeenCalled();
        await call('stream.send', owner, { subId: 'stream:resources.watch:1', data: 'x' });
        expect(ctl.write).toHaveBeenCalledWith('x');
        await call('stream.stop', other, { subId: 'stream:resources.watch:1' });
        expect(ctl.stop).not.toHaveBeenCalled();
        await call('stream.stop', owner, { subId: 'stream:resources.watch:1' });
    });

    it('drops malformed envelopes and unknown channels without touching any stream', async () => {
        const sender = new FakeSender(1);
        await call('stream.start', sender, { channel: 'pods.exec', subId: 'x', input: {} });
        await call('stream.start', sender, { channel: 'resources.watch', subId: 'bad id!', input: {} });
        await call('stream.send', sender, 42);
        await call('stream.stop', sender, {});
        expect(handler).not.toHaveBeenCalled();
        expect(activeStreamCount()).toBe(0);
    });

    it('reports a handler failure as an error followed by end', async () => {
        const sender = new FakeSender(1);
        handler.mockRejectedValue(new Error('cannot connect'));
        await start(sender);
        expect(sender.send).toHaveBeenNthCalledWith(1, 'sub.stream:resources.watch:1', {
            type: 'error',
            message: 'cannot connect',
        });
        expect(sender.send).toHaveBeenNthCalledWith(2, 'sub.stream:resources.watch:1', { type: 'end' });
        expect(activeStreamCount()).toBe(0);
    });

    it('tears down a stream that was stopped while still starting', async () => {
        const sender = new FakeSender(1);
        const ctl = controller();
        let resolve: (c: StreamController) => void = () => {};
        handler.mockReturnValue(new Promise<StreamController>((r) => (resolve = r)));
        const starting = start(sender);
        await call('stream.stop', sender, { subId: 'stream:resources.watch:1' });
        resolve(ctl);
        await starting;
        expect(ctl.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
    });

    it('replaces a stream when its subId is reused by the same window', async () => {
        const sender = new FakeSender(1);
        const first = controller();
        const second = controller();
        handler.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
        await start(sender);
        await start(sender);
        expect(first.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(1);
        await call('stream.stop', sender, { subId: 'stream:resources.watch:1' });
    });

    it("sweeps a window's streams on full reload and on destroy, ignoring in-page navigation", async () => {
        const sender = new FakeSender(1);
        const a = controller();
        const b = controller();
        handler.mockResolvedValueOnce(a).mockResolvedValueOnce(b);
        await start(sender, 'stream:resources.watch:1');
        await start(sender, 'stream:resources.watch:2');
        expect(activeStreamCount()).toBe(2);
        sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
        expect(activeStreamCount()).toBe(2);
        sender.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
        expect(a.stop).toHaveBeenCalledOnce();
        expect(b.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);

        const c = controller();
        handler.mockResolvedValueOnce(c);
        await start(sender, 'stream:resources.watch:3');
        sender.emit('destroyed');
        expect(c.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
    });

    it("stops every window's streams at once, which is what quitting relies on", async () => {
        const first = new FakeSender(1);
        const second = new FakeSender(2);
        const controllers = [controller(), controller(), controller()];
        let next = 0;
        handler.mockImplementation(async () => controllers[next++]!);
        await start(first, 'stream:resources.watch:1');
        await start(first, 'stream:resources.watch:2');
        await start(second, 'stream:resources.watch:1');
        expect(activeStreamCount()).toBe(3);

        stopAllStreams();
        for (const ctl of controllers) expect(ctl.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
    });

    it('tears down a stream still connecting when everything is stopped', async () => {
        const sender = new FakeSender(1);
        const ctl = controller();
        let resolveHandler: (value: StreamController) => void = () => {};
        handler.mockImplementation(() => new Promise<StreamController>((resolve) => (resolveHandler = resolve)));
        const pending = start(sender, 'stream:resources.watch:9');

        stopAllStreams();
        resolveHandler(ctl);
        await pending;
        expect(ctl.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
    });

    it('ends every stream with the reason when the connection they were opened on is left', async () => {
        const first = new FakeSender(1);
        const second = new FakeSender(2);
        const controllers = [controller(), controller()];
        let next = 0;
        handler.mockImplementation(async () => controllers[next++]!);
        await start(first, 'stream:pods.portForward:1');
        await start(second, 'stream:resources.watch:1');
        first.send.mockClear();
        second.send.mockClear();

        endAllStreams('The context changed to "beta"');
        for (const ctl of controllers) expect(ctl.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
        for (const [sender, subId] of [
            [first, 'stream:pods.portForward:1'],
            [second, 'stream:resources.watch:1'],
        ] as const) {
            expect(sender.send).toHaveBeenNthCalledWith(1, `sub.${subId}`, {
                type: 'error',
                message: 'The context changed to "beta"',
            });
            expect(sender.send).toHaveBeenNthCalledWith(2, `sub.${subId}`, { type: 'end' });
        }
        // A later stop from the renderer for an ended stream is a no-op.
        await call('stream.stop', first, { subId: 'stream:pods.portForward:1' });
        expect(controllers[0]!.stop).toHaveBeenCalledOnce();
    });

    it('cancels a stream still connecting when the connection is left', async () => {
        const sender = new FakeSender(1);
        const ctl = controller();
        let resolveHandler: (value: StreamController) => void = () => {};
        handler.mockImplementation(() => new Promise<StreamController>((resolve) => (resolveHandler = resolve)));
        const pending = start(sender, 'stream:pods.exec:1');
        endAllStreams('The kubeconfig changed');
        resolveHandler(ctl);
        await pending;
        expect(ctl.stop).toHaveBeenCalledOnce();
        expect(activeStreamCount()).toBe(0);
    });

    it('does not send to a destroyed window', async () => {
        const sender = new FakeSender(1);
        let push: StreamSend = () => {};
        handler.mockImplementation(async (_input, send) => {
            push = send;
            return controller();
        });
        await start(sender);
        sender.destroyed = true;
        push({ type: 'end' });
        expect(sender.send).not.toHaveBeenCalled();
        await call('stream.stop', sender, { subId: 'stream:resources.watch:1' });
    });
});
