import * as net from 'node:net';
import { PortForward } from '@kubernetes/client-node';
import { streamSchemas, type StreamController, type StreamSend } from '../../shared/streams.js';
import { kubeConfig } from './client.js';
import { apis, readOrNull } from './client.js';
import { reportMissingPod } from './pod-target.js';

type PodWebSocket = Awaited<ReturnType<PortForward['portForward']>>;

/**
 * Forward a loopback TCP port to a pod port. Each incoming connection gets its own websocket to
 * the pod, piped both ways, and that websocket is closed when the local socket closes: the client
 * only closes it on stream `end`, while a destroyed socket emits `close`, so without this every
 * connection alive at stop would leak a websocket to the API server.
 */
export async function startPodPortForward(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['pods.portForward'].parse(rawInput);
    const pod = await readOrNull(() => apis().core.readNamespacedPod({ name: input.name, namespace: input.namespace }));
    if (!pod) return reportMissingPod(send, input.name, input.namespace);

    const forward = new PortForward(kubeConfig());
    const sockets = new Set<net.Socket>();

    const server = net.createServer((socket) => {
        sockets.add(socket);
        let ws: PodWebSocket | undefined;
        const closeWs = () => {
            try {
                ws?.close();
            } catch {
                // already closed
            }
            ws = undefined;
        };
        socket.on('close', () => {
            sockets.delete(socket);
            closeWs();
        });
        socket.on('error', () => socket.destroy());
        forward
            .portForward(input.namespace, input.name, [input.targetPort], socket, null, socket)
            .then((podSocket) => {
                ws = podSocket;
                if (socket.destroyed) closeWs();
            })
            .catch((error: unknown) => {
                send({ type: 'error', message: error instanceof Error ? error.message : String(error) });
                socket.destroy();
            });
    });

    server.on('error', (error) => send({ type: 'error', message: error.message }));
    await new Promise<void>((resolve) => {
        server.listen(input.localPort, '127.0.0.1', () => {
            send({
                type: 'data',
                data: { status: 'listening', localPort: input.localPort, targetPort: input.targetPort },
            });
            resolve();
        });
        server.once('error', () => resolve());
    });

    return {
        stop: () => {
            for (const socket of sockets) socket.destroy();
            sockets.clear();
            server.close();
        },
    };
}
