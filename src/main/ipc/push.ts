import { BrowserWindow } from 'electron';
import type { SubChannel, SubPayload } from '../../shared/ipc-subscriptions.js';
import { subSchemas } from '../../shared/ipc-subscriptions.js';

/** Send a validated payload on a push channel to every open window. */
export function broadcast<C extends SubChannel>(channel: C, payload: SubPayload<C>): void {
    const data = subSchemas[channel].parse(payload);
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.webContents.send(`sub.${channel}`, data);
    }
}
