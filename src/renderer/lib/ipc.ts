import type { IpcChannel, IpcInput, IpcOutput } from '../../shared/ipc';

/**
 * Typed wrapper over the untyped `window.km` bridge. The one place the renderer casts `unknown`;
 * every other module gets per-channel input and output types from the shared contract.
 */
export async function invoke<C extends IpcChannel>(channel: C, input: IpcInput<C>): Promise<IpcOutput<C>> {
    return window.km.invoke(channel, input) as Promise<IpcOutput<C>>;
}
