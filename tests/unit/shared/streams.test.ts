import { describe, expect, it } from 'vitest';
import {
    podExecInputSchema,
    podLogsInputSchema,
    podPortForwardInputSchema,
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
    cpu: 0,
    mem: 0,
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
        const deployment = {
            name: 'web',
            namespace: 'a',
            status: 'Healthy',
            ready: '1/1',
            replicas: 1,
            updated: 1,
            available: 1,
            strategy: 'RollingUpdate',
            image: 'x',
            paused: false,
            age: '1h',
        };
        expect(watchEventSchema.safeParse({ kind: 'Deployment', type: 'modified', item: deployment }).success).toBe(
            true,
        );
        expect(watchEventSchema.safeParse({ kind: 'Deployment', type: 'modified', item: row }).success).toBe(false);
    });

    it('accepts only known channels and safe subscription ids in control envelopes', () => {
        expect(
            streamStartSchema.safeParse({ channel: 'resources.watch', subId: 'stream:resources.watch:1', input: {} })
                .success,
        ).toBe(true);
        expect(streamStartSchema.safeParse({ channel: 'pods.nope', subId: 'x', input: {} }).success).toBe(false);
        expect(
            streamStartSchema.safeParse({ channel: 'resources.watch', subId: 'evil channel/../x', input: {} }).success,
        ).toBe(false);
        expect(
            streamStartSchema.safeParse({ channel: 'resources.watch', subId: 'a'.repeat(201), input: {} }).success,
        ).toBe(false);
        expect(streamSendSchema.safeParse({ subId: 'stream:x:1', data: 'ls\n' }).success).toBe(true);
        expect(streamStopSchema.safeParse({ subId: '' }).success).toBe(false);
    });

    it('bounds the pod stream inputs', () => {
        expect(
            podLogsInputSchema.safeParse({ name: 'w', namespace: 'n', tailLines: 100, sinceSeconds: 60 }).success,
        ).toBe(true);
        expect(podLogsInputSchema.safeParse({ name: 'w', namespace: '', tailLines: 100 }).success).toBe(false);
        expect(podLogsInputSchema.safeParse({ name: 'w', namespace: 'n', tailLines: 10_001 }).success).toBe(false);
        expect(podExecInputSchema.safeParse({ name: 'w', namespace: 'n', command: ['sh'] }).success).toBe(true);
        expect(podExecInputSchema.safeParse({ name: 'w', namespace: 'n', command: [''] }).success).toBe(false);
        expect(
            podPortForwardInputSchema.safeParse({ name: 'w', namespace: 'n', targetPort: 8080, localPort: 8080 })
                .success,
        ).toBe(true);
        expect(
            podPortForwardInputSchema.safeParse({ name: 'w', namespace: 'n', targetPort: 65536, localPort: 1 }).success,
        ).toBe(false);
    });
});
