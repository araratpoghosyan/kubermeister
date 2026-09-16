import { describe, expect, it } from 'vitest';
import { isUsableSelector, labelSelectorSchema, selectorParam } from '../../../src/shared/k8s/selectors';

describe('label selectors', () => {
    it('accepts what a selector may contain and refuses what it may not', () => {
        expect(labelSelectorSchema.safeParse('app=web,tier!=db').success).toBe(true);
        expect(labelSelectorSchema.safeParse('release in (canary,stable)').success).toBe(true);
        expect(labelSelectorSchema.safeParse('app.kubernetes.io/name=web').success).toBe(true);
        // A quote, a backslash or a newline cannot appear in a selector and must not ride into a query.
        expect(labelSelectorSchema.safeParse("app='web'").success).toBe(false);
        expect(labelSelectorSchema.safeParse('app=web\nrm -rf').success).toBe(false);
        expect(labelSelectorSchema.safeParse('a'.repeat(1025)).success).toBe(false);
    });

    it('waits for a selector to be finished before sending it', () => {
        // Mid-typing is not a filter: sending it would empty the list on the way to a valid one.
        for (const unfinished of ['', '  ', 'app=', 'app=web,', 'release in (canary', 'app!']) {
            expect(isUsableSelector(unfinished)).toBe(false);
        }
        expect(isUsableSelector('app=web')).toBe(true);
        expect(isUsableSelector('release in (canary,stable)')).toBe(true);
        // A bare key means "has this label", which is a complete selector.
        expect(isUsableSelector('tier')).toBe(true);
    });

    it('hands a trimmed selector to the read, or nothing at all', () => {
        expect(selectorParam(' app=web ')).toBe('app=web');
        expect(selectorParam('app=')).toBeUndefined();
        expect(selectorParam(undefined)).toBeUndefined();
        expect(selectorParam('')).toBeUndefined();
    });
});
