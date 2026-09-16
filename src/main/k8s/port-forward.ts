import * as net from 'node:net';
import { PortForward, type V1Endpoints } from '@kubernetes/client-node';
import { streamSchemas, type StreamController, type StreamSend } from '../../shared/streams.js';
import { kubeConfig } from './client.js';
import { apis, readOrNull } from './client.js';
import { reportMissingPod } from './pod-target.js';

/** A ready pod behind a service, or null when the service has none right now. */
export function readyPodOf(endpoints: V1Endpoints | undefined): string | null {
    for (const subset of endpoints?.subsets ?? []) {
        for (const address of subset.addresses ?? []) {
            if (address.targetRef?.kind === 'Pod' && address.targetRef.name) return address.targetRef.name;
        }
    }
    return null;
}

type PodWebSocket = Awaited<ReturnType<PortForward['portForward']>>;

/**
 * Forward a loopback TCP port to a pod port. Each incoming connection gets its own websocket to
 * the pod, piped both ways, and that websocket is closed when the local socket closes: the client
 * only closes it on stream `end`, while a destroyed socket emits `close`, so without this every
 * connection alive at stop would leak a websocket to the API server.
 */
export async function startPodPortForward(rawInput: unknown, send: StreamSend): Promise<StreamController> {
    const input = streamSchemas['pods.portForward'].parse(rawInput);

    /**
     * Which pod a connection goes to. For a pod that is the pod; for a service it is whichever of
     * its endpoints is ready at the moment the connection arrives, so a forward to a service keeps
     * working across a rollout rather than dying with the pod it first found.
     */
    const resolvePod = async (): Promise<string | null> => {
        if (input.kind === 'Pod') {
            const pod = await readOrNull(() =>
                apis().core.readNamespacedPod({ name: input.name, namespace: input.namespace }),
            );
            return pod ? input.name : null;
        }
        const endpoints = await readOrNull(() =>
            apis().core.readNamespacedEndpoints({ name: input.name, namespace: input.namespace }),
        );
        return readyPodOf(endpoints);
    };

    let current = await resolvePod();
    if (!current) {
        if (input.kind === 'Pod') return reportMissingPod(send, input.name, input.namespace);
        send({ type: 'error', message: `service "${input.namespace}/${input.name}" has no ready endpoints` });
        send({ type: 'end' });
        return { stop: () => {} };
    }

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
        // Re-resolved per connection, not once at start: that is what carries a service forward
        // across a rollout, and it costs one read on a connection that is about to do far more.
        void resolvePod()
            .then(async (pod) => {
                if (!pod) throw new Error(`${input.name} has no ready pod to forward to`);
                if (pod !== current) {
                    current = pod;
                    send({
                        type: 'data',
                        data: { status: 'listening', localPort: input.localPort, targetPort: input.targetPort, pod },
                    });
                }
                const podSocket = await forward.portForward(
                    input.namespace,
                    pod,
                    [input.targetPort],
                    socket,
                    null,
                    socket,
                );
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
                data: {
                    status: 'listening',
                    localPort: input.localPort,
                    targetPort: input.targetPort,
                    pod: current ?? undefined,
                },
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
