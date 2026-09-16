import { describe, expect, it } from 'vitest';
import type { LogLine } from '../../../src/shared/k8s/logs';
import {
    isBrokenPattern,
    matchRanges,
    matcherFor,
    NO_SEARCH,
    visibleLines,
} from '../../../src/renderer/lib/log-filter';

const line = (message: string, level: LogLine['level'] = 'INFO'): LogLine => ({
    level,
    timestamp: '2026-09-16T12:00:00Z',
    message,
});

const lines = [
    line('starting up'),
    line('connection refused', 'ERROR'),
    line('retrying in 5s', 'WARN'),
    line('cache warm', 'DEBUG'),
];

describe('searching logs', () => {
    it('finds text case-insensitively by default, and exactly when asked', () => {
        expect(matcherFor({ ...NO_SEARCH, query: 'REFUSED' })!(line('connection refused'))).toBe(true);
        expect(matcherFor({ ...NO_SEARCH, query: 'REFUSED', caseSensitive: true })!(line('connection refused'))).toBe(
            false,
        );
    });

    it('reads a pattern as one when asked, and treats regex characters literally otherwise', () => {
        expect(matcherFor({ ...NO_SEARCH, query: 'ref.sed', regex: true })!(line('connection refused'))).toBe(true);
        expect(matcherFor({ ...NO_SEARCH, query: 'ref.sed' })!(line('connection refused'))).toBe(false);
    });

    it('treats an unfinished pattern as no filter rather than emptying the console mid-keystroke', () => {
        expect(matcherFor({ ...NO_SEARCH, query: 'refused(', regex: true })).toBeNull();
        expect(isBrokenPattern({ ...NO_SEARCH, query: 'refused(', regex: true })).toBe(true);
        expect(isBrokenPattern({ ...NO_SEARCH, query: 'refused(', regex: false })).toBe(false);
        expect(isBrokenPattern(NO_SEARCH)).toBe(false);
    });

    it('has no matcher at all for an empty search', () => {
        expect(matcherFor(NO_SEARCH)).toBeNull();
        expect(matcherFor({ ...NO_SEARCH, query: '   ' })).toBeNull();
    });
});

describe('what the console shows', () => {
    it('hides what does not match, and marks it instead in highlight-only mode', () => {
        const hidden = visibleLines(lines, { ...NO_SEARCH, query: 'refused' }, null);
        expect(hidden.map((v) => v.line.message)).toEqual(['connection refused']);

        const marked = visibleLines(lines, { ...NO_SEARCH, query: 'refused', highlightOnly: true }, null);
        expect(marked).toHaveLength(4);
        expect(marked.filter((v) => v.match).map((v) => v.line.message)).toEqual(['connection refused']);
    });

    it('hides everything below the chosen level, search or no search', () => {
        expect(visibleLines(lines, NO_SEARCH, 'WARN').map((v) => v.line.level)).toEqual(['ERROR', 'WARN']);
        expect(visibleLines(lines, NO_SEARCH, null)).toHaveLength(4);
        // The level floor applies before the search, so both narrow together.
        expect(visibleLines(lines, { ...NO_SEARCH, query: 'cache' }, 'WARN')).toEqual([]);
    });

    it('marks nothing when there is no search, so no line looks picked out', () => {
        expect(visibleLines(lines, NO_SEARCH, null).every((v) => v.match === false)).toBe(true);
    });
});

describe('marking matches inside a line', () => {
    it('finds every occurrence, as text or as a pattern', () => {
        expect(matchRanges('a-b-a', { ...NO_SEARCH, query: 'a' })).toEqual([
            [0, 1],
            [4, 5],
        ]);
        expect(matchRanges('a-b-a', { ...NO_SEARCH, query: '[ab]', regex: true })).toHaveLength(3);
    });

    it('treats regex characters literally unless the search is a pattern', () => {
        expect(matchRanges('a.b', { ...NO_SEARCH, query: '.' })).toEqual([[1, 2]]);
        expect(matchRanges('a.b', { ...NO_SEARCH, query: '.', regex: true })).toHaveLength(3);
    });

    it('gives up on a pattern that matches nothing, rather than marking every position', () => {
        expect(matchRanges('anything', { ...NO_SEARCH, query: 'x*', regex: true })).toEqual([]);
        expect(matchRanges('anything', { ...NO_SEARCH, query: 'x(', regex: true })).toEqual([]);
        expect(matchRanges('anything', NO_SEARCH)).toEqual([]);
    });

    it('stops marking after fifty matches in one line', () => {
        expect(matchRanges('a'.repeat(200), { ...NO_SEARCH, query: 'a' })).toHaveLength(50);
    });
});
