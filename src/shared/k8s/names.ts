import { z } from 'zod';

/**
 * A namespace name is a DNS-1123 label. Every namespace that crosses the bridge is checked against
 * this, so an empty string or selector syntax can never reach a namespace fallback: `''` is not
 * nullish, so it would defeat the explicit-else-active resolution and then read as "all namespaces".
 */
export const DNS_LABEL = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;

export const namespaceNameSchema = z.string().regex(DNS_LABEL, 'must be a DNS-1123 label');

export function isNamespaceName(value: string): boolean {
    return DNS_LABEL.test(value);
}
