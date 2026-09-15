import { z } from 'zod';
import type { AllowedChannel } from './ipc-channels.js';

const noInput = z.object({});

const appInfoSchema = z.object({
    name: z.string(),
    version: z.string(),
    electron: z.string(),
    chrome: z.string(),
    node: z.string(),
    platform: z.string(),
});

/**
 * Where the in-app updater is. `unsupported` covers development builds and Linux packages that
 * cannot self-update (deb); `message` carries the reason or the error text.
 */
const updateStateSchema = z.object({
    status: z.enum(['unsupported', 'idle', 'checking', 'up-to-date', 'downloading', 'downloaded', 'error']),
    /** Version being downloaded or ready to install. */
    version: z.string().optional(),
    /** Download progress, 0 to 100. */
    percent: z.number().min(0).max(100).optional(),
    message: z.string().optional(),
});

/**
 * The renderer-to-main contract. Every channel declares its input and output schema; main validates
 * both at the boundary and the renderer recovers the types through `lib/ipc.ts`.
 */
export const ipcSchemas = {
    'app.info': { input: noInput, output: appInfoSchema },
    'update.state': { input: noInput, output: updateStateSchema },
    'update.install': { input: noInput, output: z.object({ ok: z.boolean() }) },
} as const;

export type IpcSchemas = typeof ipcSchemas;
export type IpcChannel = keyof IpcSchemas;
export type IpcInput<C extends IpcChannel> = z.infer<IpcSchemas[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<IpcSchemas[C]['output']>;

export type AppInfo = z.infer<typeof appInfoSchema>;
export type UpdateState = z.infer<typeof updateStateSchema>;

// A channel added to one list but not the other is a type error, not a silent runtime gap.
type Assert<T extends true> = T;
type _AllChannelsAllowed = Assert<IpcChannel extends AllowedChannel ? true : false>;
type _NoStrayChannels = Assert<Exclude<AllowedChannel, IpcChannel> extends never ? true : false>;
