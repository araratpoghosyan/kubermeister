import { describe, expect, it } from 'vitest';
import { MIN_VISIBLE, usableBounds } from '../../../src/main/window-bounds.js';

const workArea = { x: 0, y: 0, width: 1920, height: 1080 };

describe('usableBounds', () => {
    it('has nothing to restore before the window has ever been closed', () => {
        expect(usableBounds(null, workArea)).toBeUndefined();
    });

    it('keeps bounds that sit inside the display', () => {
        const bounds = { x: 100, y: 80, width: 1200, height: 800 };
        expect(usableBounds(bounds, workArea)).toEqual(bounds);
    });

    it('keeps bounds that hang off an edge but leave enough of the window visible', () => {
        expect(usableBounds({ x: -400, y: 0, width: 1200, height: 800 }, workArea)).toBeTruthy();
        expect(usableBounds({ x: 1920 - MIN_VISIBLE, y: 0, width: 1200, height: 800 }, workArea)).toBeTruthy();
    });

    it('drops bounds on a display that is no longer there', () => {
        // A second monitor to the right that has since been unplugged.
        expect(usableBounds({ x: 3000, y: 200, width: 1200, height: 800 }, workArea)).toBeUndefined();
        expect(usableBounds({ x: 0, y: -900, width: 1200, height: 800 }, workArea)).toBeUndefined();
    });

    it('drops bounds that leave less than the visible minimum on screen', () => {
        const barelyOff = { x: 1920 - (MIN_VISIBLE - 1), y: 0, width: 1200, height: 800 };
        expect(usableBounds(barelyOff, workArea)).toBeUndefined();
        const barelyOn = { x: 1920 - MIN_VISIBLE, y: 1080 - MIN_VISIBLE, width: 1200, height: 800 };
        expect(usableBounds(barelyOn, workArea)).toEqual(barelyOn);
    });

    it('respects a work area that does not start at the origin', () => {
        const dockedArea = { x: 0, y: 25, width: 1440, height: 875 };
        expect(usableBounds({ x: 0, y: 0, width: 1200, height: 100 }, dockedArea)).toBeUndefined();
        expect(usableBounds({ x: 0, y: 25, width: 1200, height: 800 }, dockedArea)).toBeTruthy();
    });
});
