import { describe, expect, it } from 'vitest';
import {
    STREAM_CHANNELS,
    streamSchemas,
    streamSendSchema,
    streamStartSchema,
    streamStopSchema,
    watchEventSchema,
} from '../../../src/shared/streams';

const row = {
    name: 'web-1',
    namespace: 'team-a',
    status: 'Running',
    ready: '1/1',
    restarts: 0,
    age: '3d',
    node: 'n1',
    cpuLimit: 0,
    memLimit: 0,
};

describe('stream contract', () => {
    it('has an input schema for every stream channel', () => {
        expect(Object.keys(streamSchemas).sort()).toEqual([...STREAM_CHANNELS].sort());
    });

    it('validates watch events by kind and type', () => {
        expect(watchEventSchema.safeParse({ kind: 'Pod', type: 'added', item: row }).success).toBe(true);
        expect(watchEventSchema.safeParse({ kind: 'Pod', type: 'renamed', item: row }).success).toBe(false);
        expect(watchEventSchema.safeParse({ kind: 'Node', type: 'added', item: row }).success).toBe(false);
    });

    it('accepts only known channels and safe subscription ids in control envelopes', () => {
        expect(
            streamStartSchema.safeParse({ channel: 'resources.watch', subId: 'stream:resources.watch:1', input: {} })
                .success,
        ).toBe(true);
        expect(streamStartSchema.safeParse({ channel: 'pods.exec', subId: 'x', input: {} }).success).toBe(false);
        expect(
            streamStartSchema.safeParse({ channel: 'resources.watch', subId: 'evil channel/../x', input: {} }).success,
        ).toBe(false);
        expect(
            streamStartSchema.safeParse({ channel: 'resources.watch', subId: 'a'.repeat(201), input: {} }).success,
        ).toBe(false);
        expect(streamSendSchema.safeParse({ subId: 'stream:x:1', data: 'ls\n' }).success).toBe(true);
        expect(streamStopSchema.safeParse({ subId: '' }).success).toBe(false);
    });
});
