/**
 * A line diff, computed here rather than pulled in as a dependency: two YAML documents of a few
 * hundred lines are well within a plain longest-common-subsequence, and a diff the app owns is one
 * that can be tested without a browser.
 */

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffLine {
    kind: DiffKind;
    text: string;
    /** Line number in the left document, or null for a line only the right one has. */
    left: number | null;
    /** Line number in the right document, or null for a line only the left one has. */
    right: number | null;
}

/** Longest common subsequence lengths, the usual table, kept to numbers to stay cheap. */
function lcsTable(a: string[], b: string[]): number[][] {
    const table: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
    for (let i = a.length - 1; i >= 0; i -= 1) {
        for (let j = b.length - 1; j >= 0; j -= 1) {
            table[i]![j] = a[i] === b[j] ? table[i + 1]![j + 1]! + 1 : Math.max(table[i + 1]![j]!, table[i]![j + 1]!);
        }
    }
    return table;
}

/** The two documents as one sequence of lines, each marked same, added or removed. */
export function diffLines(left: string, right: string): DiffLine[] {
    const a = left.length === 0 ? [] : left.split('\n');
    const b = right.length === 0 ? [] : right.split('\n');
    const table = lcsTable(a, b);
    const out: DiffLine[] = [];
    let i = 0;
    let j = 0;
    while (i < a.length && j < b.length) {
        if (a[i] === b[j]) {
            out.push({ kind: 'same', text: a[i]!, left: i + 1, right: j + 1 });
            i += 1;
            j += 1;
        } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
            out.push({ kind: 'removed', text: a[i]!, left: i + 1, right: null });
            i += 1;
        } else {
            out.push({ kind: 'added', text: b[j]!, left: null, right: j + 1 });
            j += 1;
        }
    }
    for (; i < a.length; i += 1) out.push({ kind: 'removed', text: a[i]!, left: i + 1, right: null });
    for (; j < b.length; j += 1) out.push({ kind: 'added', text: b[j]!, left: null, right: j + 1 });
    return out;
}

/** Whether anything actually differs, which is what decides between a diff and "no changes". */
export const hasChanges = (lines: DiffLine[]): boolean => lines.some((line) => line.kind !== 'same');
