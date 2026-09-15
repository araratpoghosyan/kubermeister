import { describe, expect, it } from 'vitest';
import { CLUSTER_TONE, NAMESPACE_TONE, NODE_TONE, usageTone } from '../../../src/renderer/lib/status';

describe('status tones', () => {
    it('maps every domain status to a presentational tone', () => {
        expect(CLUSTER_TONE).toEqual({ Healthy: 'ok', Degraded: 'warn' });
        expect(NODE_TONE).toEqual({ Ready: 'ok', NotReady: 'danger', Cordoned: 'warn' });
        expect(NAMESPACE_TONE).toEqual({ accent: 'accent', ok: 'ok', warn: 'warn' });
    });

    it('grades usage percentages', () => {
        expect(usageTone(0)).toBe('ok');
        expect(usageTone(75)).toBe('ok');
        expect(usageTone(76)).toBe('warn');
        expect(usageTone(90)).toBe('warn');
        expect(usageTone(91)).toBe('danger');
    });
});
