import type { LogLevel, LogLine } from '../../shared/k8s/logs';

/**
 * What the log console shows and how. Kept apart from the component because this is the part worth
 * testing: a search that is a regular expression, a level floor, and whether a non-matching line is
 * hidden or merely left unhighlighted.
 */

export interface LogSearch {
    query: string;
    /** Treat the query as a regular expression rather than as text to find. */
    regex: boolean;
    caseSensitive: boolean;
    /** Keep every line and mark the matches, instead of hiding what does not match. */
    highlightOnly: boolean;
}

export const NO_SEARCH: LogSearch = { query: '', regex: false, caseSensitive: false, highlightOnly: false };

/** Least important level to show; a filter set to WARN hides INFO and DEBUG. */
export const LEVEL_ORDER: Record<LogLevel, number> = { DEBUG: 0, INFO: 1, WARN: 2, ERROR: 3 };

/**
 * The matcher for one search, or null when the search is empty or its expression is not valid. An
 * unfinished regular expression is a state people type through, so it reads as "no filter yet"
 * rather than as an error that empties the console mid-keystroke.
 */
export function matcherFor(search: LogSearch): ((line: LogLine) => boolean) | null {
    const query = search.query.trim();
    if (!query) return null;
    if (search.regex) {
        try {
            const pattern = new RegExp(query, search.caseSensitive ? '' : 'i');
            return (line) => pattern.test(line.message);
        } catch {
            return null;
        }
    }
    if (search.caseSensitive) return (line) => line.message.includes(query);
    const needle = query.toLowerCase();
    return (line) => line.message.toLowerCase().includes(needle);
}

/** True when the query is meant as a regular expression and is not one yet. */
export function isBrokenPattern(search: LogSearch): boolean {
    if (!search.regex || !search.query.trim()) return false;
    try {
        new RegExp(search.query);
        return false;
    } catch {
        return true;
    }
}

export interface VisibleLine<T extends LogLine> {
    line: T;
    /** True when the search matched this line; every line matches when there is no search. */
    match: boolean;
}

/**
 * The lines to render, in order, each marked with whether the search matched it. Hiding and
 * highlighting are the same pass so the two can never disagree about what matched.
 */
export function visibleLines<T extends LogLine>(
    lines: T[],
    search: LogSearch,
    minLevel: LogLevel | null,
): VisibleLine<T>[] {
    const matches = matcherFor(search);
    const floor = minLevel ? LEVEL_ORDER[minLevel] : null;
    const out: VisibleLine<T>[] = [];
    for (const line of lines) {
        if (floor !== null && LEVEL_ORDER[line.level] < floor) continue;
        const match = matches ? matches(line) : true;
        if (!match && !search.highlightOnly) continue;
        out.push({ line, match: matches ? match : false });
    }
    return out;
}

/** Where a search matched inside one message, for marking it in place. */
export function matchRanges(message: string, search: LogSearch): [number, number][] {
    const query = search.query.trim();
    if (!query) return [];
    const flags = search.caseSensitive ? 'g' : 'gi';
    let pattern: RegExp;
    try {
        pattern = new RegExp(search.regex ? query : query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);
    } catch {
        return [];
    }
    const ranges: [number, number][] = [];
    for (const found of message.matchAll(pattern)) {
        const start = found.index ?? 0;
        // A pattern that can match nothing would otherwise mark every position forever.
        if (found[0].length === 0) break;
        ranges.push([start, start + found[0].length]);
        if (ranges.length >= 50) break;
    }
    return ranges;
}
