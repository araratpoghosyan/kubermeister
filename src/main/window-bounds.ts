import type { WindowBounds } from '../shared/settings.js';

/** How much of the window must stay on a display for saved bounds to be worth restoring. */
export const MIN_VISIBLE = 100;

/**
 * Saved bounds can name a display that has since been unplugged or moved, which would open the
 * window where nobody can see it. They are kept only while a usable part of the window still falls
 * inside a current display's work area.
 */
export function usableBounds(bounds: WindowBounds | null, workArea: Electron.Rectangle): WindowBounds | undefined {
    if (!bounds) return undefined;
    const visibleX = Math.min(bounds.x + bounds.width, workArea.x + workArea.width) - Math.max(bounds.x, workArea.x);
    const visibleY = Math.min(bounds.y + bounds.height, workArea.y + workArea.height) - Math.max(bounds.y, workArea.y);
    return visibleX >= MIN_VISIBLE && visibleY >= MIN_VISIBLE ? bounds : undefined;
}
