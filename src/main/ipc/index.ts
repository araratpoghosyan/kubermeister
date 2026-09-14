import { app, ipcMain } from 'electron';
import type { IpcChannel, IpcInput, IpcOutput } from '../../shared/ipc.js';
import { ipcSchemas } from '../../shared/ipc.js';

type Handler<C extends IpcChannel> = (input: IpcInput<C>) => Promise<IpcOutput<C>>;
type Handlers = { [C in IpcChannel]: Handler<C> };

const handlers: Handlers = {
    'app.info': async () => ({
        name: app.getName(),
        version: app.getVersion(),
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        platform: process.platform,
    }),
};

/**
 * Registers one `ipcMain.handle` per channel in the shared contract. Input is validated before the
 * handler runs and output before it is returned, so a handler bug cannot leak an unexpected shape
 * to the renderer.
 */
export function registerHandlers(): void {
    for (const channel of Object.keys(ipcSchemas) as IpcChannel[]) {
        ipcMain.handle(channel, async (_event, rawInput: unknown) => {
            const schema = ipcSchemas[channel];
            const input = schema.input.parse(rawInput);
            const result = await handlers[channel](input);
            return schema.output.parse(result);
        });
    }
}
