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
 * The renderer-to-main contract. Every channel declares its input and output schema; main validates
 * both at the boundary and the renderer recovers the types through `lib/ipc.ts`.
 */
export const ipcSchemas = {
    'app.info': { input: noInput, output: appInfoSchema },
} as const;

export type IpcSchemas = typeof ipcSchemas;
export type IpcChannel = keyof IpcSchemas;
export type IpcInput<C extends IpcChannel> = z.infer<IpcSchemas[C]['input']>;
export type IpcOutput<C extends IpcChannel> = z.infer<IpcSchemas[C]['output']>;

export type AppInfo = z.infer<typeof appInfoSchema>;

// A channel added to one list but not the other is a type error, not a silent runtime gap.
type Assert<T extends true> = T;
type _AllChannelsAllowed = Assert<IpcChannel extends AllowedChannel ? true : false>;
type _NoStrayChannels = Assert<Exclude<AllowedChannel, IpcChannel> extends never ? true : false>;
