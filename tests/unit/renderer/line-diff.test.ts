import { describe, expect, it } from 'vitest';
import { diffLines, hasChanges } from '@/lib/line-diff';

const kinds = (left: string, right: string) => diffLines(left, right).map((line) => `${line.kind}:${line.text}`);

describe('diffLines', () => {
    it('keeps what both sides share and marks what only one has', () => {
        expect(kinds('a\nb\nc', 'a\nx\nc')).toEqual(['same:a', 'removed:b', 'added:x', 'same:c']);
        expect(kinds('a\nb', 'a\nb\nc')).toEqual(['same:a', 'same:b', 'added:c']);
        expect(kinds('a\nb\nc', 'a\nc')).toEqual(['same:a', 'removed:b', 'same:c']);
    });

    it('numbers each line against the document it came from', () => {
        const lines = diffLines('a\nb', 'a\nx');
        expect(lines.map((line) => [line.left, line.right])).toEqual([
            [1, 1],
            [2, null],
            [null, 2],
        ]);
    });

    it('handles an empty side and two identical documents', () => {
        expect(kinds('', 'a')).toEqual(['added:a']);
        expect(kinds('a', '')).toEqual(['removed:a']);
        expect(kinds('', '')).toEqual([]);
        expect(hasChanges(diffLines('a\nb', 'a\nb'))).toBe(false);
        expect(hasChanges(diffLines('a', 'b'))).toBe(true);
    });

    it('finds the longest run in common rather than the first match', () => {
        // A naive walk would pair the first "x" and call everything after it a change.
        expect(kinds('x\na\nb\nc', 'a\nb\nc\nx')).toEqual(['removed:x', 'same:a', 'same:b', 'same:c', 'added:x']);
    });
});
