import type { QueryClient } from '@tanstack/react-query';
import type { RememberedForward } from '../../shared/settings';
import { invoke } from './ipc';
import { ipcQueryKey } from './query';
import { updateSettings } from './settings';

/** How many forwards are worth keeping; older ones fall off rather than growing without end. */
const REMEMBERED_LIMIT = 20;

/**
 * Remember a forward against the context it was made on, so it can be offered again rather than
 * reconstructed from memory. Only ever offered: reopening a local port without being asked would
 * be the app taking a decision about the user's machine.
 */
export async function rememberForward(client: QueryClient, target: Omit<RememberedForward, 'context'>): Promise<void> {
    const context = await client
        .fetchQuery({ queryKey: ipcQueryKey('context.current', {}), queryFn: () => invoke('context.current', {}) })
        .catch(() => null);
    if (!context) return;

    const settings = await client.fetchQuery({
        queryKey: ipcQueryKey('settings.get', {}),
        queryFn: () => invoke('settings.get', {}),
    });
    const entry: RememberedForward = { ...target, context: context.name };
    const key = (one: RememberedForward) => `${one.context}/${one.kind}/${one.namespace}/${one.name}/${one.localPort}`;
    const kept = settings.data.forwards.filter((one) => key(one) !== key(entry));
    await updateSettings(client, { data: { forwards: [...kept, entry].slice(-REMEMBERED_LIMIT) } });
}
