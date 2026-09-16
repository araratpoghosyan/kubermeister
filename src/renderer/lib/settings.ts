import type { QueryClient } from '@tanstack/react-query';
import type { Settings, SettingsInput } from '../../shared/settings';
import { invoke } from './ipc';
import { invalidateClusterQueries, ipcQueryKey, useIpcQuery } from './query';

const SETTINGS_KEY = ipcQueryKey('settings.get', {});

export function useSettings() {
    return useIpcQuery('settings.get', {});
}

/** Live-poll cadence in milliseconds from the persisted refresh interval, falling back while settings load. */
export function useRefreshIntervalMs(fallbackMs = 12_000): number {
    const { data } = useSettings();
    return data ? data.data.refreshIntervalSec * 1000 : fallbackMs;
}

/** How many log lines a live follow keeps, from settings, falling back while they load. */
export function useLogBufferLines(fallback = 2_000): number {
    const { data } = useSettings();
    return data ? data.data.logBufferLines : fallback;
}

/** Terminal font size from settings, falling back while they load. */
export function useTerminalFontSize(fallback = 12): number {
    const { data } = useSettings();
    return data ? data.data.terminalFontSize : fallback;
}

/** Persist a patch; the merged result lands in the cache so controls reflect it at once. */
export async function updateSettings(client: QueryClient, patch: SettingsInput): Promise<Settings> {
    const settings = await invoke('settings.set', patch);
    client.setQueryData(SETTINGS_KEY, settings);
    return settings;
}

/** Re-point the app at a kubeconfig through the native dialog; a cancelled dialog changes nothing. */
export async function pickKubeconfig(client: QueryClient): Promise<void> {
    const { path } = await invoke('kubeconfig.pick', {});
    if (path === null) return;
    await client.invalidateQueries({ queryKey: SETTINGS_KEY });
    await invalidateClusterQueries();
}

export async function resetKubeconfig(client: QueryClient): Promise<void> {
    const settings = await invoke('kubeconfig.useDefault', {});
    client.setQueryData(SETTINGS_KEY, settings);
    await invalidateClusterQueries();
}
