import { describe, expect, it } from 'vitest';
import {
    CLUSTER_TONE,
    CONTAINER_TONE,
    NAMESPACE_TONE,
    NODE_TONE,
    POD_TONE,
    usageTone,
} from '../../../src/renderer/lib/status';

describe('status tones', () => {
    it('maps every domain status to a presentational tone', () => {
        expect(CLUSTER_TONE).toEqual({ Healthy: 'ok', Degraded: 'warn' });
        expect(NODE_TONE).toEqual({ Ready: 'ok', NotReady: 'danger', Cordoned: 'warn' });
        expect(NAMESPACE_TONE).toEqual({ accent: 'accent', ok: 'ok', warn: 'warn' });
        expect(POD_TONE.CrashLoop).toBe('danger');
        expect(POD_TONE.Terminating).toBe('neutral');
        expect(Object.keys(POD_TONE).sort()).toEqual([
            'CrashLoop',
            'Error',
            'Failed',
            'Pending',
            'Running',
            'Succeeded',
            'Terminating',
            'Unknown',
        ]);
        expect(Object.keys(CONTAINER_TONE).sort()).toEqual([
            'Completed',
            'CrashLoop',
            'Failed',
            'Pending',
            'Running',
            'Unknown',
        ]);
    });

    it('grades usage percentages', () => {
        expect(usageTone(0)).toBe('ok');
        expect(usageTone(75)).toBe('ok');
        expect(usageTone(76)).toBe('warn');
        expect(usageTone(90)).toBe('warn');
        expect(usageTone(91)).toBe('danger');
    });
});
