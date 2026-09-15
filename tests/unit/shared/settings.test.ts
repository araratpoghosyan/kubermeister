import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SETTINGS,
    mergeSettings,
    parseSettings,
    settingsInputSchema,
    settingsPatchSchema,
} from '../../../src/shared/settings';

describe('parseSettings', () => {
    it('returns valid settings unchanged', () => {
        const valid = {
            version: 1,
            session: { lastContext: 'prod', lastNamespace: 'default', restoreOnLaunch: true },
            connection: { kubeconfigPath: '/tmp/kubeconfig' },
            data: { refreshIntervalSec: 30 },
            window: { bounds: { x: 0, y: 0, width: 1200, height: 800 } },
        };
        expect(parseSettings(valid)).toEqual(valid);
    });

    it('falls back to defaults on corrupt or non-object input', () => {
        expect(parseSettings(undefined)).toEqual(DEFAULT_SETTINGS);
        expect(parseSettings('not json')).toEqual(DEFAULT_SETTINGS);
        expect(parseSettings({ garbage: true })).toEqual(DEFAULT_SETTINGS);
        expect(parseSettings([1, 2])).toEqual(DEFAULT_SETTINGS);
    });

    it('falls back to defaults on an unknown version', () => {
        expect(parseSettings({ ...DEFAULT_SETTINGS, version: 2 })).toEqual(DEFAULT_SETTINGS);
    });

    it('resets only the section whose field has the wrong type', () => {
        const bad = {
            version: 1,
            session: { lastContext: 'prod', lastNamespace: null, restoreOnLaunch: 'yes' },
            connection: { kubeconfigPath: '/tmp/k' },
        };
        const parsed = parseSettings(bad);
        expect(parsed.session).toEqual(DEFAULT_SETTINGS.session);
        expect(parsed.connection).toEqual({ kubeconfigPath: '/tmp/k' });
    });

    it('fills missing keys and sections with defaults and drops unknown keys', () => {
        const partial = { version: 1, session: { lastContext: 'staging', bogus: 1 } };
        expect(parseSettings(partial)).toEqual({
            version: 1,
            session: { lastContext: 'staging', lastNamespace: null, restoreOnLaunch: true },
            connection: { kubeconfigPath: null },
            data: { refreshIntervalSec: 12 },
            window: { bounds: null },
        });
    });

    it('forgets saved window bounds that are not a full rectangle', () => {
        expect(parseSettings({ version: 1, window: { bounds: { x: 0, y: 0, width: 800 } } }).window).toEqual({
            bounds: null,
        });
        const bounds = { x: 10, y: 20, width: 800, height: 600 };
        expect(parseSettings({ version: 1, window: { bounds } }).window).toEqual({ bounds });
    });

    it('resets a refresh interval that is not a positive integer', () => {
        expect(parseSettings({ version: 1, data: { refreshIntervalSec: 'soon' } }).data).toEqual({
            refreshIntervalSec: 12,
        });
        expect(parseSettings({ version: 1, data: { refreshIntervalSec: 0 } }).data).toEqual({ refreshIntervalSec: 12 });
        expect(parseSettings({ version: 1, data: { refreshIntervalSec: 30 } }).data).toEqual({
            refreshIntervalSec: 30,
        });
    });
});

describe('mergeSettings', () => {
    it('merges a section patch while preserving the other sections', () => {
        const merged = mergeSettings(DEFAULT_SETTINGS, { connection: { kubeconfigPath: '/k' } });
        expect(merged.connection.kubeconfigPath).toBe('/k');
        expect(merged.session).toEqual(DEFAULT_SETTINGS.session);
    });

    it('replaces only the supplied keys within a section', () => {
        const merged = mergeSettings(DEFAULT_SETTINGS, { session: { lastContext: 'staging' } });
        expect(merged.session.lastContext).toBe('staging');
        expect(merged.session.restoreOnLaunch).toBe(DEFAULT_SETTINGS.session.restoreOnLaunch);
        expect(merged.session.lastNamespace).toBe(DEFAULT_SETTINGS.session.lastNamespace);
    });

    it('is a no-op for an empty patch and keeps the version', () => {
        expect(mergeSettings(DEFAULT_SETTINGS, {})).toEqual(DEFAULT_SETTINGS);
        expect(mergeSettings(DEFAULT_SETTINGS, { session: { lastNamespace: 'x' } }).version).toBe(1);
    });
});

describe('patch schemas', () => {
    it('accepts partial sections in the main-process patch', () => {
        expect(settingsPatchSchema.safeParse({ connection: { kubeconfigPath: '/k' } }).success).toBe(true);
        expect(settingsPatchSchema.safeParse({ session: { restoreOnLaunch: 'no' } }).success).toBe(false);
    });

    it('refuses the kubeconfig path from the renderer input schema', () => {
        expect(settingsInputSchema.safeParse({ session: { lastNamespace: 'kube-system' } }).success).toBe(true);
        const withPath = settingsInputSchema.safeParse({ connection: { kubeconfigPath: '/etc/passwd' } });
        expect(withPath.success && 'connection' in withPath.data).toBe(false);
    });

    it('lets the renderer change the refresh interval', () => {
        expect(settingsInputSchema.safeParse({ data: { refreshIntervalSec: 30 } }).success).toBe(true);
        expect(settingsInputSchema.safeParse({ data: { refreshIntervalSec: -1 } }).success).toBe(false);
        expect(mergeSettings(DEFAULT_SETTINGS, { data: { refreshIntervalSec: 60 } }).data.refreshIntervalSec).toBe(60);
        expect(mergeSettings(DEFAULT_SETTINGS, { data: { refreshIntervalSec: 60 } }).session).toEqual(
            DEFAULT_SETTINGS.session,
        );
    });
});
