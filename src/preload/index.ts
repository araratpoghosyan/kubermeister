import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, SUBSCRIPTION_CHANNELS } from '../shared/ipc-channels.js';

/** Channels the renderer may reach. Anything else is rejected here, before it leaves the sandbox. */
const allowed = new Set<string>(IPC_CHANNELS);
const subscribable = new Set<string>(SUBSCRIPTION_CHANNELS);

contextBridge.exposeInMainWorld('km', {
    invoke: (channel: string, input: unknown): Promise<unknown> => {
        if (!allowed.has(channel)) return Promise.reject(new Error(`blocked IPC channel: ${channel}`));
        return ipcRenderer.invoke(channel, input);
    },

    /** Listen to a main-to-renderer push channel; returns the unsubscribe function. */
    subscribe: (channel: string, handler: (payload: unknown) => void): (() => void) => {
        if (!subscribable.has(channel)) throw new Error(`blocked subscription channel: ${channel}`);
        const eventName = `sub.${channel}`;
        const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => handler(payload);
        ipcRenderer.on(eventName, listener);
        return () => {
            ipcRenderer.removeListener(eventName, listener);
        };
    },
});
