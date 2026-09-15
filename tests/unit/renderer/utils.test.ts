import { describe, expect, it } from 'vitest';
import { cn, spaceKind } from '@/lib/utils';

describe('cn', () => {
    it('keeps a theme font size next to a theme text color and still resolves real conflicts', () => {
        expect(cn('text-meta', 'text-text-muted')).toBe('text-meta text-text-muted');
        expect(cn('text-body', 'text-meta')).toBe('text-meta');
        expect(cn('text-text-2', 'text-text-muted')).toBe('text-text-muted');
        expect(cn('p-2', false, undefined, 'p-4')).toBe('p-4');
    });
});

describe('spaceKind', () => {
    it('inserts spaces at camel-case boundaries only', () => {
        expect(spaceKind('ClusterRoleBinding')).toBe('Cluster Role Binding');
        expect(spaceKind('Pod')).toBe('Pod');
        expect(spaceKind('v1Beta2')).toBe('v1 Beta2');
    });
});
