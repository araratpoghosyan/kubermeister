import { z } from 'zod';

/**
 * Persisted application settings: the app's own durable state, written to a JSON file the main
 * process owns (`src/main/settings/store.ts`). Recording the last selected context and namespace
 * here never mutates the kubeconfig on disk, so the kubeconfig stays read-only.
 */

const sessionSchema = z.object({
    /** The context the app reopens on: its own pointer, not the kubeconfig's current-context. */
    lastContext: z.string().nullable(),
    lastNamespace: z.string().nullable(),
    /** When false, launch follows the kubeconfig's current-context instead of `lastContext`. */
    restoreOnLaunch: z.boolean(),
});

const connectionSchema = z.object({
    /** Kubeconfig file to read; null means the default ($KUBECONFIG or ~/.kube/config). */
    kubeconfigPath: z.string().nullable(),
});

/** Live-refresh cadences offered in Settings, in seconds. */
export const REFRESH_INTERVAL_OPTIONS = [5, 10, 15, 30, 60] as const;

const dataSchema = z.object({
    /** Poll cadence for the live lists, metrics and dashboard queries. */
    refreshIntervalSec: z.number().int().positive(),
});

/**
 * How far the updater goes on its own: `check` finds new versions and lets the user start the
 * download, `download` fetches them in the background and asks only to restart, `off` never checks
 * unless asked to from Settings or the menu.
 */
export const UPDATE_MODES = ['check', 'download', 'off'] as const;

const updatesSchema = z.object({
    mode: z.enum(UPDATE_MODES),
});

const windowBoundsSchema = z.object({
    x: z.number(),
    y: z.number(),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
});

const windowSchema = z.object({
    /** Where the window last stood; null until it has been closed once. */
    bounds: windowBoundsSchema.nullable(),
});

export const settingsSchema = z.object({
    version: z.literal(1),
    session: sessionSchema,
    connection: connectionSchema,
    data: dataSchema,
    updates: updatesSchema,
    window: windowSchema,
});

/** A partial patch the main process may apply: any subset of sections, each a partial of its shape. */
export const settingsPatchSchema = z.object({
    session: sessionSchema.partial().optional(),
    connection: connectionSchema.partial().optional(),
    data: dataSchema.partial().optional(),
    updates: updatesSchema.partial().optional(),
    window: windowSchema.partial().optional(),
});

/**
 * What the renderer may set through `settings.set`. The kubeconfig path is excluded on purpose:
 * pointing the app at an arbitrary file is a native-dialog action (`kubeconfig.pick`), never a raw
 * renderer-supplied string, so a compromised renderer cannot probe files or trigger exec plugins.
 */
export const settingsInputSchema = settingsPatchSchema.omit({ connection: true, window: true });

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;
export type WindowBounds = z.infer<typeof windowBoundsSchema>;
export type UpdateMode = (typeof UPDATE_MODES)[number];

export const DEFAULT_SETTINGS: Settings = {
    version: 1,
    session: { lastContext: null, lastNamespace: null, restoreOnLaunch: true },
    connection: { kubeconfigPath: null },
    data: { refreshIntervalSec: 12 },
    updates: { mode: 'check' },
    window: { bounds: null },
};

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Each section is validated on its own over its defaults, so a missing or unknown key never
 * discards the rest of the file and a section added in a later version starts from defaults for
 * existing users. A section that fails validation falls back to its defaults alone.
 */
function parseSection<T extends Record<string, unknown>>(schema: z.ZodType<T>, value: unknown, fallback: T): T {
    const candidate = { ...fallback, ...(isRecord(value) ? value : {}) };
    const result = schema.safeParse(candidate);
    return result.success ? result.data : fallback;
}

/** Coerce arbitrary parsed JSON into valid {@link Settings}; never throws. */
export function parseSettings(raw: unknown): Settings {
    const file = isRecord(raw) && raw.version === 1 ? raw : {};
    return {
        version: 1,
        session: parseSection(sessionSchema, file.session, DEFAULT_SETTINGS.session),
        connection: parseSection(connectionSchema, file.connection, DEFAULT_SETTINGS.connection),
        data: parseSection(dataSchema, file.data, DEFAULT_SETTINGS.data),
        updates: parseSection(updatesSchema, file.updates, DEFAULT_SETTINGS.updates),
        window: parseSection(windowSchema, file.window, DEFAULT_SETTINGS.window),
    };
}

/** Merge a patch over current settings, section by section; a supplied section replaces only its own keys. */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
    return {
        version: current.version,
        session: { ...current.session, ...patch.session },
        connection: { ...current.connection, ...patch.connection },
        data: { ...current.data, ...patch.data },
        updates: { ...current.updates, ...patch.updates },
        window: { ...current.window, ...patch.window },
    };
}
