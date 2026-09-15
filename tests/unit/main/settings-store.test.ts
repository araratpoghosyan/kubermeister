import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS } from '../../../src/shared/settings';

let userData = '';
vi.mock('electron', () => ({ app: { getPath: () => userData } }));

async function loadStore() {
    vi.resetModules();
    return import('../../../src/main/settings/store.js');
}

describe('settings store', () => {
    beforeEach(() => {
        userData = mkdtempSync(join(tmpdir(), 'km-settings-'));
    });

    afterEach(() => {
        rmSync(userData, { recursive: true, force: true });
        vi.restoreAllMocks();
    });

    it('starts from defaults when no file exists and does not create one on read', async () => {
        const { getSettings } = await loadStore();
        expect(getSettings()).toEqual(DEFAULT_SETTINGS);
        expect(existsSync(join(userData, 'settings.json'))).toBe(false);
    });

    it('loads a valid file and caches it', async () => {
        const stored = { ...DEFAULT_SETTINGS, session: { ...DEFAULT_SETTINGS.session, lastContext: 'prod' } };
        writeFileSync(join(userData, 'settings.json'), JSON.stringify(stored));
        const { getSettings } = await loadStore();
        expect(getSettings().session.lastContext).toBe('prod');
        writeFileSync(join(userData, 'settings.json'), JSON.stringify(DEFAULT_SETTINGS));
        expect(getSettings().session.lastContext).toBe('prod');
    });

    it('falls back to defaults on a corrupt file', async () => {
        writeFileSync(join(userData, 'settings.json'), '{ not json');
        const { getSettings } = await loadStore();
        expect(getSettings()).toEqual(DEFAULT_SETTINGS);
    });

    it('persists updates atomically and returns the merged settings', async () => {
        const { updateSettings } = await loadStore();
        const next = updateSettings({ connection: { kubeconfigPath: '/k' } });
        expect(next.connection.kubeconfigPath).toBe('/k');
        expect(JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'))).toEqual(next);
        expect(existsSync(join(userData, 'settings.json.tmp'))).toBe(false);
    });

    it('survives a write failure without throwing', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        // A file where the directory should be makes mkdir fail.
        rmSync(userData, { recursive: true, force: true });
        writeFileSync(userData, 'not a directory');
        const { updateSettings } = await loadStore();
        expect(() => updateSettings({ session: { lastNamespace: 'x' } })).not.toThrow();
        expect(error).toHaveBeenCalledOnce();
    });
});
