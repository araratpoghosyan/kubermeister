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

export const settingsSchema = z.object({
    version: z.literal(1),
    session: sessionSchema,
    connection: connectionSchema,
});

/** A partial patch the main process may apply: any subset of sections, each a partial of its shape. */
export const settingsPatchSchema = z.object({
    session: sessionSchema.partial().optional(),
    connection: connectionSchema.partial().optional(),
});

/**
 * What the renderer may set through `settings.set`. The kubeconfig path is excluded on purpose:
 * pointing the app at an arbitrary file is a native-dialog action (`kubeconfig.pick`), never a raw
 * renderer-supplied string, so a compromised renderer cannot probe files or trigger exec plugins.
 */
export const settingsInputSchema = settingsPatchSchema.omit({ connection: true });

export type Settings = z.infer<typeof settingsSchema>;
export type SettingsPatch = z.infer<typeof settingsPatchSchema>;
export type SettingsInput = z.infer<typeof settingsInputSchema>;

export const DEFAULT_SETTINGS: Settings = {
    version: 1,
    session: { lastContext: null, lastNamespace: null, restoreOnLaunch: true },
    connection: { kubeconfigPath: null },
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
    };
}

/** Merge a patch over current settings, section by section; a supplied section replaces only its own keys. */
export function mergeSettings(current: Settings, patch: SettingsPatch): Settings {
    return {
        version: current.version,
        session: { ...current.session, ...patch.session },
        connection: { ...current.connection, ...patch.connection },
    };
}
