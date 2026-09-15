import { ipcMain, type WebContents } from 'electron';
import {
    streamSendSchema,
    streamStartSchema,
    streamStopSchema,
    type StreamChannel,
    type StreamController,
    type StreamSend,
} from '../../shared/streams.js';
import { startResourceWatch } from '../k8s/watch.js';

/** A stream handler starts pushing through `send` and returns how to stop (and optionally write). */
export type StreamHandler = (input: unknown, send: StreamSend) => Promise<StreamController>;

const HANDLERS: Record<StreamChannel, StreamHandler> = {
    'resources.watch': startResourceWatch,
};

/**
 * Streams are keyed by `<webContents.id>:<subId>`, never by the raw subId. The preload mints
 * subIds from a per-renderer counter that resets on reload, so two windows produce identical ids;
 * the sender id keeps each window's streams private, and ownership is implicit: a `send` or `stop`
 * can only ever form a key with its own sender id.
 */
const streamKey = (senderId: number, subId: string): string => `${senderId}:${subId}`;

const active = new Map<string, StreamController>();
/** Keys whose handler is still setting up (connecting, listing). */
const starting = new Set<string>();
/** Keys stopped while still starting; torn down the moment setup resolves. */
const cancelled = new Set<string>();
const senderSubs = new Map<WebContents, Set<string>>();
const wiredSenders = new WeakSet<WebContents>();

function stop(key: string): void {
    const controller = active.get(key);
    if (controller) {
        controller.stop();
        active.delete(key);
        for (const subs of senderSubs.values()) subs.delete(key);
        return;
    }
    if (starting.has(key)) cancelled.add(key);
}

/** Track a stream against its window and, once per window, tear everything down on reload or destroy. */
function track(sender: WebContents, key: string): void {
    let subs = senderSubs.get(sender);
    if (!subs) {
        subs = new Set();
        senderSubs.set(sender, subs);
    }
    subs.add(key);

    if (wiredSenders.has(sender)) return;
    wiredSenders.add(sender);
    const sweep = () => {
        const owned = senderSubs.get(sender);
        if (!owned) return;
        for (const id of [...owned]) stop(id);
        senderSubs.delete(sender);
    };
    // A full reload is a new document; in-page hash navigation is not.
    sender.on('did-start-navigation', (event) => {
        if (event.isMainFrame && !event.isSameDocument) sweep();
    });
    sender.once('destroyed', sweep);
}

export function registerStreamHandlers(): void {
    ipcMain.handle('stream.start', async (event, arg: unknown) => {
        const parsed = streamStartSchema.safeParse(arg);
        // A malformed envelope cannot be trusted to name a push event; drop it silently.
        if (!parsed.success) return;
        const { channel, subId, input } = parsed.data;
        const sender = event.sender;
        const key = streamKey(sender.id, subId);
        const send: StreamSend = (message) => {
            if (!sender.isDestroyed()) sender.send(`sub.${subId}`, message);
        };
        // A reused subId must not overwrite this window's live stream: stop it, then start fresh.
        stop(key);
        cancelled.delete(key);
        starting.add(key);
        try {
            const controller = await HANDLERS[channel](input, send);
            starting.delete(key);
            if (cancelled.has(key)) {
                cancelled.delete(key);
                controller.stop();
                return;
            }
            active.set(key, controller);
            track(sender, key);
        } catch (error) {
            starting.delete(key);
            cancelled.delete(key);
            send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
            send({ type: 'end' });
        }
    });

    ipcMain.handle('stream.send', (event, arg: unknown) => {
        const parsed = streamSendSchema.safeParse(arg);
        if (!parsed.success) return;
        active.get(streamKey(event.sender.id, parsed.data.subId))?.write?.(parsed.data.data);
    });

    ipcMain.handle('stream.stop', (event, arg: unknown) => {
        const parsed = streamStopSchema.safeParse(arg);
        if (!parsed.success) return;
        stop(streamKey(event.sender.id, parsed.data.subId));
    });
}

/** Test hook: how many streams are live. */
export function activeStreamCount(): number {
    return active.size;
}
