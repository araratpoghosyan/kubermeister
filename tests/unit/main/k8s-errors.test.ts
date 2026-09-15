import { ApiException } from '@kubernetes/client-node';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { K8sError, withK8s } from '../../../src/main/k8s/errors';

async function failWith(error: unknown): Promise<K8sError> {
    try {
        await withK8s('op', () => Promise.reject(error));
    } catch (caught) {
        return caught as K8sError;
    }
    throw new Error('expected withK8s to reject');
}

describe('withK8s', () => {
    it('returns the value of a successful call', async () => {
        await expect(withK8s('op', () => Promise.resolve(42))).resolves.toBe(42);
    });

    it('classifies HTTP statuses from the client exception', async () => {
        const cases: Array<[number, string]> = [
            [403, 'forbidden'],
            [401, 'unauthorized'],
            [404, 'notFound'],
            [409, 'conflict'],
            [400, 'invalid'],
            [422, 'invalid'],
        ];
        for (const [status, kind] of cases) {
            const error = await failWith(new ApiException(status, 'http dump', { message: 'server says' }, {}));
            expect(error.kind, `status ${status}`).toBe(kind);
            expect(error.op).toBe('op');
            expect(error.name).toBe('K8sError');
        }
    });

    it('uses the server Status.message as detail for write-path failures', async () => {
        const conflict = await failWith(
            new ApiException(409, 'dump', { message: 'services "web" already exists' }, {}),
        );
        expect(conflict.message).toBe('[conflict] services "web" already exists');
        const invalid = await failWith(new ApiException(422, 'dump', { message: 'spec.ports: Required value' }, {}));
        expect(invalid.message).toBe('[invalid] spec.ports: Required value');
    });

    it('falls back to the exception message when the body has no message', async () => {
        const error = await failWith(new ApiException(409, 'raw dump', null, {}));
        expect(error.message).toMatch(/^\[conflict\] /);
        expect(error.message).toContain('raw dump');
    });

    it('reads numeric codes and statusCodes from plain error objects', async () => {
        expect((await failWith({ code: 403 })).kind).toBe('forbidden');
        expect((await failWith({ statusCode: 404 })).kind).toBe('notFound');
    });

    it('treats connection, DNS and TLS failures as unreachable, including nested causes', async () => {
        expect((await failWith(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).kind).toBe('unreachable');
        const nested = new Error('fetch failed', { cause: Object.assign(new Error('dns'), { code: 'ENOTFOUND' }) });
        expect((await failWith(nested)).kind).toBe('unreachable');
        const tls = new Error('tls', { cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } });
        expect((await failWith(tls)).kind).toBe('unreachable');
        const aborted = Object.assign(new Error('aborted'), { name: 'AbortError' });
        expect((await failWith(aborted)).kind).toBe('unreachable');
    });

    it('finds connection codes inside AggregateError branches and survives cycles', async () => {
        const branch = Object.assign(new Error('v6'), { code: 'EHOSTUNREACH' });
        const aggregate = new AggregateError([new Error('v4'), branch], 'connect failed');
        expect((await failWith(aggregate)).kind).toBe('unreachable');
        const cyclic: { code: string; cause?: unknown } = { code: 'nothing' };
        cyclic.cause = cyclic;
        expect((await failWith(cyclic)).kind).toBe('unknown');
    });

    it('reports anything else as unknown with the original message', async () => {
        const error = await failWith(new Error('boom'));
        expect(error.message).toBe('[unknown] boom');
        expect((await failWith('plain string')).message).toBe('[unknown] plain string');
        expect((await failWith(null)).kind).toBe('unknown');
    });

    it('passes an existing K8sError through unchanged', async () => {
        const original = new K8sError('forbidden', 'nope', 'inner');
        expect(await failWith(original)).toBe(original);
    });
});

describe('withK8s timeout', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('rejects as unreachable when the call outlives the timeout', async () => {
        const pending = withK8s('slow', () => new Promise<never>(() => {}), 1_000);
        const assertion = expect(pending).rejects.toMatchObject({ kind: 'unreachable', op: 'slow' });
        await vi.advanceTimersByTimeAsync(1_000);
        await assertion;
    });

    it('does not fire the timeout after a fast call', async () => {
        await expect(withK8s('fast', () => Promise.resolve('ok'), 1_000)).resolves.toBe('ok');
        expect(vi.getTimerCount()).toBe(0);
    });
});
