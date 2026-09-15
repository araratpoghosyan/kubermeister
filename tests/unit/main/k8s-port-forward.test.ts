import * as net from 'node:net';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const portForward = vi.fn();
vi.mock('@kubernetes/client-node', async () => ({
    ...(await vi.importActual<typeof import('@kubernetes/client-node')>('@kubernetes/client-node')),
    PortForward: class {
        portForward = portForward;
    },
}));
const readOrNull = vi.fn();
vi.mock('../../../src/main/k8s/client.js', () => ({
    kubeConfig: () => ({}),
    apis: () => ({ core: { readNamespacedPod: vi.fn() } }),
    readOrNull,
}));

const { startPodPortForward } = await import('../../../src/main/k8s/port-forward.js');

async function freePort(): Promise<number> {
    return new Promise((resolve) => {
        const probe = net.createServer().listen(0, '127.0.0.1', () => {
            const { port } = probe.address() as net.AddressInfo;
            probe.close(() => resolve(port));
        });
    });
}

function connect(port: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
        const socket = net.connect(port, '127.0.0.1', () => resolve(socket));
        socket.on('error', reject);
    });
}

describe('startPodPortForward', () => {
    const ws = { close: vi.fn() };

    beforeEach(() => {
        portForward.mockReset();
        ws.close.mockReset();
        readOrNull.mockResolvedValue({ metadata: { name: 'web-1' } });
        portForward.mockResolvedValue(ws);
    });

    it('listens on loopback, reports listening, forwards each connection, and closes everything on stop', async () => {
        const localPort = await freePort();
        const send = vi.fn();
        const ctl = await startPodPortForward(
            { name: 'web-1', namespace: 'team-a', targetPort: 8080, localPort },
            send,
        );
        expect(send).toHaveBeenCalledWith({ type: 'data', data: { status: 'listening', localPort, targetPort: 8080 } });

        const client = await connect(localPort);
        await vi.waitFor(() =>
            expect(portForward).toHaveBeenCalledWith(
                'team-a',
                'web-1',
                [8080],
                expect.any(net.Socket),
                null,
                expect.any(net.Socket),
            ),
        );
        await vi.waitFor(() => expect(portForward.mock.results[0]?.value).resolves.toBe(ws));

        ctl.stop();
        await new Promise<void>((resolve) => client.once('close', () => resolve()));
        await vi.waitFor(() => expect(ws.close).toHaveBeenCalledOnce());
        await expect(connect(localPort)).rejects.toThrow();
    });

    it('closes the pod websocket when the local socket closes on its own', async () => {
        const localPort = await freePort();
        const ctl = await startPodPortForward(
            { name: 'web-1', namespace: 'team-a', targetPort: 80, localPort },
            vi.fn(),
        );
        const client = await connect(localPort);
        await vi.waitFor(() => expect(portForward).toHaveBeenCalled());
        await new Promise((resolve) => setImmediate(resolve));
        client.destroy();
        await vi.waitFor(() => expect(ws.close).toHaveBeenCalledOnce());
        ctl.stop();
    });

    it('reports a forward failure and drops that connection', async () => {
        portForward.mockRejectedValue(new Error('upgrade refused'));
        const localPort = await freePort();
        const send = vi.fn();
        const ctl = await startPodPortForward({ name: 'web-1', namespace: 'team-a', targetPort: 80, localPort }, send);
        const client = await connect(localPort);
        await new Promise<void>((resolve) => client.once('close', () => resolve()));
        expect(send).toHaveBeenCalledWith({ type: 'error', message: 'upgrade refused' });
        ctl.stop();
    });

    it('reports a port that is already in use', async () => {
        const blocker = net.createServer().listen(0, '127.0.0.1');
        await new Promise((resolve) => blocker.once('listening', resolve));
        const { port } = blocker.address() as net.AddressInfo;
        const send = vi.fn();
        const ctl = await startPodPortForward(
            { name: 'web-1', namespace: 'team-a', targetPort: 80, localPort: port },
            send,
        );
        expect(send).toHaveBeenCalledWith({ type: 'error', message: expect.stringContaining('EADDRINUSE') });
        ctl.stop();
        blocker.close();
    });

    it('reports a missing pod and rejects bad ports', async () => {
        readOrNull.mockResolvedValue(undefined);
        const send = vi.fn();
        await startPodPortForward({ name: 'gone', namespace: 'team-a', targetPort: 80, localPort: 40000 }, send);
        expect(send).toHaveBeenNthCalledWith(1, { type: 'error', message: 'pod "team-a/gone" not found' });
        await expect(
            startPodPortForward({ name: 'x', namespace: 'y', targetPort: 0, localPort: 1 }, vi.fn()),
        ).rejects.toThrow();
        await expect(
            startPodPortForward({ name: 'x', namespace: 'y', targetPort: 80, localPort: 70000 }, vi.fn()),
        ).rejects.toThrow();
    });
});
