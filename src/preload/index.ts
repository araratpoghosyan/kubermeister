import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';

/** Channels the renderer may reach. Anything else is rejected here, before it leaves the sandbox. */
const allowed = new Set<string>(IPC_CHANNELS);

contextBridge.exposeInMainWorld('km', {
    invoke: (channel: string, input: unknown): Promise<unknown> => {
        if (!allowed.has(channel)) return Promise.reject(new Error(`blocked IPC channel: ${channel}`));
        return ipcRenderer.invoke(channel, input);
    },
});
