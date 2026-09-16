import { z } from 'zod';

/**
 * Label selectors, as the API server itself understands them (`app=web,tier!=db`,
 * `release in (canary,stable)`, a bare key for "has this label"). The app does not filter rows it
 * has already fetched: it asks the API server for the objects that match, which is the only way a
 * filter can also apply to a watch and to a list of thousands.
 */

/**
 * What a selector may contain. Anything outside this set — a quote, a backslash, a newline, a `?` —
 * cannot appear in a valid selector and would otherwise ride into a query string.
 */
const SELECTOR_CHARS = /^[A-Za-z0-9\-_.=!,()/ ]*$/;

export const labelSelectorSchema = z
    .string()
    .max(1024)
    .refine((value) => SELECTOR_CHARS.test(value), 'contains characters a label selector cannot have');

/** Whether a selector is complete enough to send: an unfinished one filters to nothing by mistake. */
export function isUsableSelector(value: string): boolean {
    const trimmed = value.trim();
    if (trimmed.length === 0) return false;
    if (!SELECTOR_CHARS.test(trimmed)) return false;
    // A trailing separator or an unclosed set is mid-typing, not a selector that means anything.
    if (/[,=!(]$/.test(trimmed)) return false;
    const opens = (trimmed.match(/\(/g) ?? []).length;
    const closes = (trimmed.match(/\)/g) ?? []).length;
    return opens === closes;
}

/** The selector to send with a read, or undefined when there is nothing usable to send yet. */
export function selectorParam(value: string | undefined): string | undefined {
    return value && isUsableSelector(value) ? value.trim() : undefined;
}
