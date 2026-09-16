import { useCallback, useState } from 'react';
import type { VisibilityState } from '@tanstack/react-table';

/**
 * Which columns a list screen shows, remembered per screen. This is a preference about one
 * person's window, not data about the cluster, so it lives in `localStorage` beside the theme
 * rather than in the settings file the app syncs and validates.
 */
const KEY_PREFIX = 'km-columns:';

export function readColumnVisibility(screen: string): VisibilityState {
    try {
        const raw = localStorage.getItem(KEY_PREFIX + screen);
        if (!raw) return {};
        const parsed: unknown = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
        // Only the false entries matter: a column is shown unless it was hidden on purpose.
        return Object.fromEntries(
            Object.entries(parsed as Record<string, unknown>)
                .filter(([, value]) => value === false)
                .map(([id]) => [id, false]),
        );
    } catch {
        // Private windows and blocked site data throw on access; a screen must still render.
        return {};
    }
}

export function writeColumnVisibility(screen: string, visibility: VisibilityState): void {
    try {
        const hidden = Object.entries(visibility).filter(([, value]) => value === false);
        if (hidden.length === 0) localStorage.removeItem(KEY_PREFIX + screen);
        else localStorage.setItem(KEY_PREFIX + screen, JSON.stringify(Object.fromEntries(hidden)));
    } catch {
        // Nothing to do: the choice simply will not survive this window.
    }
}

/** Column visibility for one screen, restored on mount and written back as it changes. */
export function usePersistedColumns(screen: string) {
    const [visibility, setVisibility] = useState<VisibilityState>(() => readColumnVisibility(screen));
    const update = useCallback(
        (next: VisibilityState | ((current: VisibilityState) => VisibilityState)) => {
            setVisibility((current) => {
                const resolved = typeof next === 'function' ? next(current) : next;
                writeColumnVisibility(screen, resolved);
                return resolved;
            });
        },
        [screen],
    );
    return [visibility, update] as const;
}
