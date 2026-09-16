import { Writable } from 'node:stream';
import { describe, expect, it, vi, beforeEach } from 'vitest';

const core = {
    readNamespacedPod: vi.fn(),
    patchNamespacedPodEphemeralcontainers: vi.fn(),
    createNamespacedPod: vi.fn(),
};
const client = {
    apis: () => ({ core }),
    kubeConfig: () => ({}),
    activeContextName: vi.fn<() => string>(() => 'alpha'),
    getActiveNamespace: vi.fn<() => string | null>(() => 'team-a'),
};
vi.mock('../../../src/main/k8s/client.js', () => client);

/** One fake exec per call: the test drives what it writes and how it finishes. */
const execCalls: {
    command: string[];
    stdout: Writable;
    stderr: Writable;
    finish: (status: { status: string; message?: string }) => void;
}[] = [];
vi.mock('@kubernetes/client-node', async () => {
    const actual = await vi.importActual<typeof import('@kubernetes/client-node')>('@kubernetes/client-node');
    return {
        ...actual,
        Exec: class {
            exec(
                _namespace: string,
                _pod: string,
                _container: string,
                command: string[],
                stdout: Writable,
                stderr: Writable,
                _stdin: unknown,
                _tty: boolean,
                finish: (status: { status: string; message?: string }) => void,
            ) {
                execCalls.push({ command, stdout, stderr, finish });
                return Promise.resolve({ close: vi.fn() });
            }
        },
    };
});

const files = { written: new Map<string, string>() };
vi.mock('node:fs', async () => {
    const { Writable: W, Readable } = await import('node:stream');
    return {
        createWriteStream: (path: string) => {
            let text = '';
            const sink = new W({
                write(chunk: Buffer, _encoding, callback) {
                    text += chunk.toString('utf8');
                    files.written.set(path, text);
                    callback();
                },
            });
            (sink as unknown as { close: () => void }).close = () => sink.end();
            return sink;
        },
        createReadStream: () => Readable.from(['local file body']),
    };
});

const debug = await import('../../../src/main/k8s/debug.js');

const ON_ALPHA = { context: 'alpha', name: 'web-1', namespace: 'team-a' };

beforeEach(() => {
    vi.clearAllMocks();
    execCalls.length = 0;
    files.written.clear();
    client.activeContextName.mockReturnValue('alpha');
    core.readNamespacedPod.mockResolvedValue({ spec: { containers: [{ name: 'web' }] } });
    core.patchNamespacedPodEphemeralcontainers.mockResolvedValue({});
    core.createNamespacedPod.mockImplementation(async ({ body }: { body: { metadata: { name: string } } }) => body);
});

describe('attaching a debug container', () => {
    it('adds one through the ephemeral subresource, keeping any already there', async () => {
        core.readNamespacedPod.mockResolvedValue({
            spec: { containers: [{ name: 'web' }], ephemeralContainers: [{ name: 'earlier', image: 'busybox' }] },
        });
        const result = await debug.addDebugContainer({ ...ON_ALPHA, targetContainer: 'web' });
        expect(result).toMatchObject({ pod: 'web-1', namespace: 'team-a' });
        expect(result.container).toMatch(/^debugger-\d+$/);

        // A JSON patch, which is what that subresource takes.
        const [operation] = core.patchNamespacedPodEphemeralcontainers.mock.calls[0][0].body;
        expect(operation).toMatchObject({ op: 'add', path: '/spec/ephemeralContainers' });
        expect(operation.value).toHaveLength(2);
        const added = operation.value[1];
        expect(added).toMatchObject({
            image: 'busybox:1.36',
            targetContainerName: 'web',
            stdin: true,
            tty: true,
        });
    });

    it('takes the image the caller names, and omits the target when there is none', async () => {
        await debug.addDebugContainer({ ...ON_ALPHA, image: 'alpine:3.20' });
        const added = core.patchNamespacedPodEphemeralcontainers.mock.calls[0][0].body[0].value[0];
        expect(added.image).toBe('alpine:3.20');
        expect(added).not.toHaveProperty('targetContainerName');
    });

    it('refuses one aimed at a context the app has left', async () => {
        client.activeContextName.mockReturnValue('beta');
        await expect(debug.addDebugContainer(ON_ALPHA)).rejects.toMatchObject({ kind: 'conflict' });
        expect(core.patchNamespacedPodEphemeralcontainers).not.toHaveBeenCalled();
    });
});

describe('the node shell pod', () => {
    it('borrows the host namespaces, tolerates everything, and enters init', () => {
        const pod = debug.nodeShellPod('node-1', 'shell-1', 'busybox:1.36');
        expect(pod.spec).toMatchObject({
            nodeName: 'node-1',
            hostPID: true,
            hostNetwork: true,
            hostIPC: true,
            restartPolicy: 'Never',
            tolerations: [{ operator: 'Exists' }],
        });
        const container = pod.spec!.containers[0]!;
        expect(container.securityContext).toEqual({ privileged: true });
        expect(container.command).toContain('nsenter');
        // Labelled as this app's work, and as belonging to the node it is for.
        expect(pod.metadata?.labels).toMatchObject({ 'kubermeister.io/node': 'node-1' });
    });

    it('creates it in the namespace the caller named and reports its name', async () => {
        const result = await debug.startNodeShell({ context: 'alpha', name: 'node-1', namespace: 'team-a' });
        expect(result.namespace).toBe('team-a');
        expect(result.container).toBe('shell');
        expect(result.pod).toMatch(/^kubermeister-node-shell-node-1-/);
        expect(core.createNamespacedPod.mock.calls[0][0].namespace).toBe('team-a');
    });

    it('refuses one aimed at a context the app has left', async () => {
        client.activeContextName.mockReturnValue('beta');
        await expect(
            debug.startNodeShell({ context: 'alpha', name: 'node-1', namespace: 'team-a' }),
        ).rejects.toMatchObject({ kind: 'conflict' });
        expect(core.createNamespacedPod).not.toHaveBeenCalled();
    });
});

describe('copying files', () => {
    const target = { ...ON_ALPHA, container: 'web' };

    it('streams an archive out of the container into the chosen file', async () => {
        const copy = debug.copyFromPod({ ...target, remotePath: '/etc/nginx.conf', localPath: '/tmp/out.tar' });
        await vi.waitFor(() => expect(execCalls).toHaveLength(1));
        expect(execCalls[0]!.command).toEqual(['tar', 'cf', '-', '/etc/nginx.conf']);
        execCalls[0]!.stdout.write('archive bytes');
        execCalls[0]!.finish({ status: 'Success' });
        await expect(copy).resolves.toEqual({ localPath: '/tmp/out.tar', remotePath: '/etc/nginx.conf' });
        expect(files.written.get('/tmp/out.tar')).toBe('archive bytes');
    });

    it('reports what the container said when a copy out fails', async () => {
        const copy = debug.copyFromPod({ ...target, remotePath: '/nope', localPath: '/tmp/out.tar' });
        await vi.waitFor(() => expect(execCalls).toHaveLength(1));
        execCalls[0]!.stderr.write('tar: /nope: not found');
        execCalls[0]!.finish({ status: 'Failure' });
        await expect(copy).rejects.toMatchObject({ kind: 'invalid', detail: expect.stringContaining('not found') });
    });

    it('writes a local file into the directory named, under its own name', async () => {
        const copy = debug.copyToPod({ ...target, remotePath: '/data', localPath: '/home/me/notes.txt' });
        await vi.waitFor(() => expect(execCalls).toHaveLength(1));
        expect(execCalls[0]!.command[2]).toBe("cat > '/data/notes.txt'");
        execCalls[0]!.finish({ status: 'Success' });
        await expect(copy).resolves.toEqual({ localPath: '/home/me/notes.txt', remotePath: '/data/notes.txt' });
    });

    it('reports a failed copy in, naming the file rather than the whole path', async () => {
        const copy = debug.copyToPod({
            context: 'alpha',
            name: 'web-1',
            namespace: 'team-a',
            container: 'web',
            remotePath: '/read-only',
            localPath: '/home/me/notes.txt',
        });
        await vi.waitFor(() => expect(execCalls).toHaveLength(1));
        execCalls[0]!.stderr.write('sh: /read-only/notes.txt: Read-only file system');
        execCalls[0]!.finish({ status: 'Failure' });
        await expect(copy).rejects.toMatchObject({
            kind: 'invalid',
            detail: expect.stringContaining('notes.txt'),
        });
    });

    it('falls back to the status message when the container said nothing', async () => {
        const copy = debug.copyFromPod({
            context: 'alpha',
            name: 'web-1',
            namespace: 'team-a',
            container: 'web',
            remotePath: '/etc',
            localPath: '/tmp/out.tar',
        });
        await vi.waitFor(() => expect(execCalls).toHaveLength(1));
        execCalls[0]!.finish({ status: 'Failure', message: 'command terminated with exit code 2' });
        await expect(copy).rejects.toMatchObject({ detail: expect.stringContaining('exit code 2') });
    });

    it('quotes a path so a name with a quote cannot become part of the command', () => {
        expect(debug.shellQuote('/tmp/plain')).toBe("'/tmp/plain'");
        expect(debug.shellQuote("/tmp/it's here; rm -rf /")).toBe(`'/tmp/it'\\''s here; rm -rf /'`);
    });

    it('refuses either direction from a context the app has left', async () => {
        client.activeContextName.mockReturnValue('beta');
        const expected = { kind: 'conflict' };
        await expect(
            debug.copyFromPod({ ...target, remotePath: '/etc', localPath: '/tmp/out.tar' }),
        ).rejects.toMatchObject(expected);
        await expect(debug.copyToPod({ ...target, remotePath: '/data', localPath: '/tmp/in' })).rejects.toMatchObject(
            expected,
        );
        expect(execCalls).toHaveLength(0);
    });
});
