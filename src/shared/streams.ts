import { z } from 'zod';
import { STREAM_CHANNELS, type AllowedStream } from './ipc-channels.js';
import { podSchema } from './k8s/pods.js';
import type { Kind } from './k8s/registry.js';
import { resourceListInputSchema, type ResourceListInput } from './k8s/resources.js';

/**
 * Streaming contract, separate from the one-shot `invoke` channels. A stream pushes many messages
 * over time on a per-subscription event (`sub.<subId>`). The renderer opens one through
 * `window.km.stream(...)`, which returns a stop function; main pushes messages until the stream
 * ends or is stopped.
 */

export type StreamMessage<T = unknown> =
    { type: 'data'; data: T } | { type: 'error'; message: string } | { type: 'end' };

/** Sender given to main-side stream handlers. */
export type StreamSend = (message: StreamMessage) => void;

/** What a main-side stream handler returns: teardown, plus optional renderer-to-main input for bidirectional streams. */
export interface StreamController {
    stop: () => void;
    write?: (data: unknown) => void;
}

/** One change to a watched list. `added` also replays the current objects when a watch starts. */
export const watchEventSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('Pod'), type: z.enum(['added', 'modified', 'deleted']), item: podSchema }),
]);

export type WatchEvent = z.infer<typeof watchEventSchema>;
export type WatchEventOf<K extends Kind> = Extract<WatchEvent, { kind: K }>;

/** Per-channel stream contract: renderer-to-main input and main-to-renderer data. */
export interface StreamContract extends Record<AllowedStream, { input: unknown; data: unknown }> {
    'resources.watch': { input: ResourceListInput; data: WatchEvent };
}

export { STREAM_CHANNELS };
export type StreamChannel = AllowedStream;
export type StreamInput<C extends StreamChannel> = StreamContract[C]['input'];
export type StreamData<C extends StreamChannel> = StreamContract[C]['data'];

/** Runtime input validation per stream channel, mirroring {@link StreamContract}. */
export const streamSchemas = {
    'resources.watch': resourceListInputSchema,
} satisfies Record<StreamChannel, z.ZodType>;

/**
 * The renderer-minted subscription id becomes part of a `sub.<subId>` event name, so it is bounded
 * and limited to a safe character set: a malformed value must not forge an arbitrary event name.
 */
const subIdSchema = z
    .string()
    .min(1)
    .max(200)
    .regex(/^[\w.:-]+$/);

export const streamStartSchema = z.object({
    channel: z.enum(STREAM_CHANNELS),
    subId: subIdSchema,
    input: z.unknown(),
});
export const streamSendSchema = z.object({ subId: subIdSchema, data: z.unknown() });
export const streamStopSchema = z.object({ subId: subIdSchema });
